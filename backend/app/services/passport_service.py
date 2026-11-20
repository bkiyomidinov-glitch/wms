from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ConflictError,
    DomainValidationError,
    NotFoundError,
    PermissionDeniedError,
)
from app.domain.enums import PassportEventType, PassportStatus, StoreType
from app.models.passport import Passport, PassportEvent, ProcessingAct
from app.models.product import Product
from app.models.store import Store
from app.models.user import User
from app.schemas.passport import (
    BoningProcessCreate,
    InitialReceiptCreate,
    PassportAcceptReceiptCreate,
    PassportDispatchCreate,
    PassportDispatchResult,
    PassportEventRead,
    PassportGenealogyNode,
    PassportGenealogyTree,
    PassportRead,
    ProcessingActRead,
    StorePassportAggregatedProduct,
    StorePassportInventorySummary,
)


def _serialize_event(ev: PassportEvent) -> PassportEventRead:
    return PassportEventRead(
        id=ev.id,
        passport_id=ev.passport_id,
        event_type=ev.event_type,
        state_snapshot=ev.state_snapshot,
        product_type_snapshot=ev.product_type_snapshot,
        product_name_snapshot=ev.product_name_snapshot,
        barcode_qr_snapshot=ev.barcode_qr_snapshot,
        qty_snapshot=ev.qty_snapshot,
        qty_delta=ev.qty_delta,
        batch_number_snapshot=ev.batch_number_snapshot,
        production_date_snapshot=ev.production_date_snapshot,
        storage_responsible_snapshot=ev.storage_responsible_snapshot,
        registered_at=ev.registered_at,
        operator_id=ev.operator_id,
        operator_name_snapshot=ev.operator_name_snapshot,
        to_location_name=ev.to_location_name,
        to_store_id=ev.to_store_id,
        from_location_name=ev.from_location_name,
        from_store_id=ev.from_store_id,
        balance_before_store=ev.balance_before_store,
        balance_after_store=ev.balance_after_store,
        state_changed_from=ev.state_changed_from,
        notes=ev.notes,
        custom_attributes=ev.custom_attributes or {},
    )


def _serialize_act(act: ProcessingAct) -> ProcessingActRead:
    return ProcessingActRead(
        id=act.id,
        act_code=act.act_code,
        source_passport_id=act.source_passport_id,
        store_id=act.store_id,
        store_name=act.store.name if act.store else None,
        target_store_id=act.target_store_id,
        target_store_name=act.target_store.name if act.target_store else None,
        performed_by_id=act.performed_by_id,
        performed_by_name=act.performed_by.full_name if act.performed_by else None,
        performed_at=act.performed_at,
        input_qty=act.input_qty,
        output_qty=act.output_qty,
        loss_qty=act.loss_qty,
        loss_percent=act.loss_percent,
        notes=act.notes,
        created_at=act.created_at,
    )


def serialize_passport(p: Passport) -> PassportRead:
    events = [_serialize_event(ev) for ev in (p.events or [])]
    act = _serialize_act(p.processing_act) if p.processing_act else None

    unit_name = "кг"
    if p.product and p.product.base_unit:
        unit_name = p.product.base_unit.name

    return PassportRead(
        id=p.id,
        passport_code=p.passport_code,
        lineage_path=p.lineage_path or p.passport_code,
        qr_payload=p.qr_payload,
        root_passport_id=p.root_passport_id,
        parent_passport_id=p.parent_passport_id,
        parent_passport_code=p.parent_passport.passport_code if p.parent_passport else None,
        processing_act_id=p.processing_act_id,
        child_seq=p.child_seq or 0,
        product_id=p.product_id,
        product_name=p.product.name if p.product else "Товар",
        product_barcode=p.product.barcode if p.product else "",
        product_sku=p.product.sku if p.product else "",
        unit_name=unit_name,
        batch_number=p.batch_number,
        production_date=p.production_date,
        current_state=p.current_state,
        current_product_type=p.current_product_type,
        initial_qty=p.initial_qty or p.current_qty,
        current_qty=p.current_qty,
        current_store_id=p.current_store_id,
        current_store_name=p.current_store.name if p.current_store else "Склад",
        current_store_type=p.current_store.store_type if p.current_store else "OTHER",
        pending_target_store_id=p.pending_target_store_id,
        pending_target_store_name=p.pending_target_store.name if p.pending_target_store else None,
        current_storage_responsible=p.current_storage_responsible,
        status=p.status,
        custom_attributes=p.custom_attributes or {},
        created_by_operator_id=p.created_by_operator_id,
        created_by_operator_name=p.created_by.full_name if p.created_by else None,
        created_at=p.created_at,
        updated_at=p.updated_at,
        events=events,
        processing_act=act,
    )


async def _calc_store_product_balance(
    db: AsyncSession, store_id: uuid.UUID, product_id: uuid.UUID
) -> Decimal:
    """Вычисляет фактический остаток товара на складе по активным паспортам."""
    res = await db.execute(
        select(func.coalesce(func.sum(Passport.current_qty), 0)).where(
            Passport.current_store_id == store_id,
            Passport.product_id == product_id,
            Passport.status.in_([PassportStatus.IN_STOCK.value, PassportStatus.IN_PRODUCTION.value]),
        )
    )
    val = res.scalar() or 0
    return Decimal(str(val))


async def get_passport_by_id(
    db: AsyncSession, passport_id: uuid.UUID
) -> Passport:
    stmt = (
        select(Passport)
        .where(Passport.id == passport_id)
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
            selectinload(Passport.pending_target_store),
            selectinload(Passport.created_by),
            selectinload(Passport.parent_passport),
            selectinload(Passport.events),
            selectinload(Passport.processing_act).selectinload(ProcessingAct.store),
            selectinload(Passport.processing_act).selectinload(ProcessingAct.target_store),
            selectinload(Passport.processing_act).selectinload(ProcessingAct.performed_by),
        )
    )
    res = await db.execute(stmt)
    p = res.scalar_one_or_none()
    if not p:
        raise NotFoundError("Паспорт ячейки не найден")
    return p


async def search_passport(
    db: AsyncSession, query: str
) -> list[Passport]:
    q = query.strip()
    if not q:
        return []

    clean_code = q
    if q.upper().startswith("PKZ:"):
        clean_code = q[4:].strip()

    stmt = (
        select(Passport)
        .join(Passport.product)
        .where(
            or_(
                Passport.passport_code.ilike(clean_code),
                Passport.lineage_path.ilike(f"%{clean_code}%"),
                Passport.qr_payload.ilike(q),
                Passport.qr_payload.ilike(f"PKZ:{clean_code}"),
                Product.barcode == q,
                Passport.batch_number.ilike(f"%{q}%"),
            )
        )
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
            selectinload(Passport.pending_target_store),
            selectinload(Passport.created_by),
            selectinload(Passport.events),
            selectinload(Passport.processing_act),
        )
        .order_by(Passport.created_at.desc())
        .limit(20)
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def generate_next_root_code(db: AsyncSession) -> str:
    """Генерирует следующий глобальный корневой номер (1, 2, 3...)."""
    res = await db.execute(
        select(Passport.passport_code).where(Passport.parent_passport_id.is_(None))
    )
    codes = res.scalars().all()
    max_num = 0
    for c in codes:
        if c.isdigit():
            max_num = max(max_num, int(c))
    return str(max_num + 1)


async def create_initial_receipt(
    db: AsyncSession, actor: User, data: InitialReceiptCreate
) -> PassportRead:
    """ЭТАП 0 — Первичная приемка крупной партии сырья на ССП (Склад сырой продукции) с кодом № id 1."""
    if not actor.has_permission("can_inbound"):
        raise PermissionDeniedError("Нет прав на выполнение приемки (can_inbound)")
    if not actor.has_store_access(data.store_id):
        raise PermissionDeniedError("Нет доступа к указанному складу")

    prod_res = await db.execute(
        select(Product).where(Product.id == data.product_id).options(selectinload(Product.base_unit))
    )
    product = prod_res.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")

    store_res = await db.execute(select(Store).where(Store.id == data.store_id))
    store = store_res.scalar_one_or_none()
    if not store:
        raise NotFoundError("Склад не найден")

    code = await generate_next_root_code(db)
    qr_payload = f"PKZ:{code}"
    now_utc = datetime.now(timezone.utc)

    balance_before = await _calc_store_product_balance(db, store.id, product.id)
    balance_after = balance_before + data.qty

    passport_id = uuid.uuid4()
    passport = Passport(
        id=passport_id,
        passport_code=code,
        lineage_path=code,
        qr_payload=qr_payload,
        root_passport_id=passport_id,
        parent_passport_id=None,
        processing_act_id=None,
        child_seq=0,
        product_id=product.id,
        batch_number=data.batch_number.strip(),
        production_date=data.production_date,
        current_state=data.state.strip(),
        current_product_type=data.product_type.strip(),
        initial_qty=data.qty,
        current_qty=data.qty,
        current_store_id=store.id,
        pending_target_store_id=None,
        current_storage_responsible=data.storage_responsible.strip(),
        status=PassportStatus.IN_STOCK.value,
        custom_attributes=data.custom_attributes,
        created_by_operator_id=actor.id,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(passport)
    await db.flush()

    event = PassportEvent(
        passport_id=passport.id,
        event_type=PassportEventType.INITIAL_RECEIPT.value,
        state_snapshot=data.state.strip(),
        product_type_snapshot=data.product_type.strip(),
        product_name_snapshot=product.name,
        barcode_qr_snapshot=f"{product.barcode} / {qr_payload}",
        qty_snapshot=data.qty,
        qty_delta=Decimal("0.000"),
        batch_number_snapshot=data.batch_number.strip(),
        production_date_snapshot=data.production_date,
        storage_responsible_snapshot=data.storage_responsible.strip(),
        registered_at=now_utc,
        operator_id=actor.id,
        operator_name_snapshot=actor.full_name,
        to_location_name=store.name,
        to_store_id=store.id,
        from_location_name=data.from_location_name.strip(),
        from_store_id=None,
        balance_before_store=balance_before,
        balance_after_store=balance_after,
        state_changed_from=None,
        notes=data.notes,
        custom_attributes=data.custom_attributes,
    )
    db.add(event)
    await db.commit()

    return serialize_passport(await get_passport_by_id(db, passport.id))


async def dispatch_passport(
    db: AsyncSession, actor: User, passport_id: uuid.UUID, data: PassportDispatchCreate
) -> PassportDispatchResult:
    """
    Отправка / Частичное дробление партии (Lot Splitting).
    Если send_qty < current_qty:
      Родитель P уменьшает остаток (P.current_qty -= send_qty), счетчик P.child_seq += 1,
      создается дочерний паспорт ${P.passport_code}.${P.child_seq} (IN_TRANSIT).
      Для P пишется событие SPLIT_OUT, для дочернего — DISPATCH.
    Если send_qty == current_qty:
      Отправляется весь паспорт целиком (status = IN_TRANSIT, pending_target_store = target).
    """
    if not actor.has_permission("can_outbound"):
        raise PermissionDeniedError("Нет прав на выполнение отправки (can_outbound)")

    send_qty = data.send_qty or data.actual_qty_at_dispatch or Decimal("0.000")
    if send_qty <= Decimal("0.000"):
        raise DomainValidationError("Количество для отправки должно быть больше нуля.")

    # Row-Level Locking SELECT ... FOR UPDATE on parent
    stmt = (
        select(Passport)
        .where(Passport.id == passport_id)
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
        )
        .with_for_update()
    )
    res = await db.execute(stmt)
    parent = res.scalar_one_or_none()
    if not parent:
        raise NotFoundError("Паспорт ячейки не найден")

    if not actor.has_store_access(parent.current_store_id):
        raise PermissionDeniedError("Нет доступа к складу отправления")

    if parent.status not in (PassportStatus.IN_STOCK.value, PassportStatus.IN_PRODUCTION.value):
        raise DomainValidationError(
            f"Невозможно отправить паспорт в статусе {parent.status}. Требуется IN_STOCK или IN_PRODUCTION."
        )

    if send_qty > parent.current_qty:
        raise DomainValidationError(
            f"Запрошенное количество ({send_qty} кг) превышает доступный остаток в ячейке ({parent.current_qty} кг)!"
        )

    target_res = await db.execute(select(Store).where(Store.id == data.target_store_id))
    target_store = target_res.scalar_one_or_none()
    if not target_store:
        raise NotFoundError("Целевой склад не найден")

    current_store = parent.current_store
    product = parent.product
    now_utc = datetime.now(timezone.utc)
    unit_name = product.base_unit.name if (product and product.base_unit) else "кг"

    # CASE A: Частичное дробление партии (Lot Splitting: send_qty < current_qty)
    if send_qty < parent.current_qty:
        parent.child_seq = (parent.child_seq or 0) + 1
        child_code = f"{parent.passport_code}.{parent.child_seq}"
        child_qr = f"PKZ:{child_code}"
        child_lineage = f"{parent.lineage_path or parent.passport_code}.{parent.child_seq}"
        root_id = parent.root_passport_id or parent.id

        # Update parent stock
        old_parent_qty = parent.current_qty
        parent.current_qty = old_parent_qty - send_qty
        if parent.current_qty == Decimal("0.000"):
            parent.status = PassportStatus.DEPLETED.value
        parent.updated_at = now_utc

        # Store balance calculation
        bal_curr_before = await _calc_store_product_balance(db, current_store.id, product.id)
        bal_curr_after = max(Decimal("0.000"), bal_curr_before - send_qty)

        # 1. Event SPLIT_OUT on parent
        split_event = PassportEvent(
            passport_id=parent.id,
            event_type=PassportEventType.SPLIT_OUT.value,
            state_snapshot=parent.current_state,
            product_type_snapshot=parent.current_product_type,
            product_name_snapshot=product.name,
            barcode_qr_snapshot=f"{product.barcode} / {parent.qr_payload}",
            qty_snapshot=parent.current_qty,
            qty_delta=-send_qty,
            batch_number_snapshot=parent.batch_number,
            production_date_snapshot=parent.production_date,
            storage_responsible_snapshot=data.storage_responsible.strip(),
            registered_at=now_utc,
            operator_id=actor.id,
            operator_name_snapshot=actor.full_name,
            to_location_name=f"{target_store.name} (выделен № {child_code})",
            to_store_id=target_store.id,
            from_location_name=current_store.name,
            from_store_id=current_store.id,
            balance_before_store=bal_curr_before,
            balance_after_store=bal_curr_after,
            state_changed_from=None,
            notes=f"Отделена дочерняя партия № {child_code} ({send_qty} {unit_name}) для отправки в {target_store.name}. Остаток родителя: {parent.current_qty} {unit_name}",
            custom_attributes=data.custom_attributes,
        )
        db.add(split_event)

        # 2. Create child passport
        child_passport = Passport(
            passport_code=child_code,
            lineage_path=child_lineage,
            qr_payload=child_qr,
            root_passport_id=root_id,
            parent_passport_id=parent.id,
            processing_act_id=None,
            child_seq=0,
            product_id=product.id,
            batch_number=parent.batch_number,
            production_date=parent.production_date,
            current_state=data.state_at_dispatch.strip(),
            current_product_type=parent.current_product_type,
            initial_qty=send_qty,
            current_qty=send_qty,
            current_store_id=current_store.id,
            pending_target_store_id=target_store.id,
            current_storage_responsible=data.storage_responsible.strip(),
            status=PassportStatus.IN_TRANSIT.value,
            custom_attributes=data.custom_attributes,
            created_by_operator_id=actor.id,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(child_passport)
        await db.flush()

        # 3. Event DISPATCH on child
        state_changed = (
            parent.current_state != data.state_at_dispatch.strip()
            if parent.current_state
            else False
        )
        child_dispatch_event = PassportEvent(
            passport_id=child_passport.id,
            event_type=PassportEventType.DISPATCH.value,
            state_snapshot=data.state_at_dispatch.strip(),
            product_type_snapshot=parent.current_product_type,
            product_name_snapshot=product.name,
            barcode_qr_snapshot=f"{product.barcode} / {child_qr}",
            qty_snapshot=send_qty,
            qty_delta=Decimal("0.000"),
            batch_number_snapshot=parent.batch_number,
            production_date_snapshot=parent.production_date,
            storage_responsible_snapshot=data.storage_responsible.strip(),
            registered_at=now_utc,
            operator_id=actor.id,
            operator_name_snapshot=actor.full_name,
            to_location_name=target_store.name,
            to_store_id=target_store.id,
            from_location_name=current_store.name,
            from_store_id=current_store.id,
            balance_before_store=bal_curr_before,
            balance_after_store=bal_curr_after,
            state_changed_from=parent.current_state if state_changed else None,
            notes=data.notes or f"Отправка дочерней партии № {child_code} (родитель № {parent.passport_code})",
            custom_attributes=data.custom_attributes,
        )
        db.add(child_dispatch_event)
        await db.commit()

        p_fresh = await get_passport_by_id(db, parent.id)
        c_fresh = await get_passport_by_id(db, child_passport.id)
        return PassportDispatchResult(
            parent_passport=serialize_passport(p_fresh),
            dispatched_passport=serialize_passport(c_fresh),
            split_occurred=True,
            remaining_qty_in_parent=p_fresh.current_qty,
        )

    # CASE B: Отправка всего паспорта целиком (send_qty == parent.current_qty)
    old_state = parent.current_state
    new_state = data.state_at_dispatch.strip()
    state_changed_from = old_state if old_state != new_state else None

    bal_curr_before = await _calc_store_product_balance(db, current_store.id, product.id)
    bal_curr_after = max(Decimal("0.000"), bal_curr_before - parent.current_qty)

    parent.status = PassportStatus.IN_TRANSIT.value
    parent.pending_target_store_id = target_store.id
    parent.pending_target_store = target_store
    parent.current_state = new_state
    parent.current_storage_responsible = data.storage_responsible.strip()
    parent.updated_at = now_utc

    event = PassportEvent(
        passport_id=parent.id,
        event_type=PassportEventType.DISPATCH.value,
        state_snapshot=new_state,
        product_type_snapshot=parent.current_product_type,
        product_name_snapshot=product.name,
        barcode_qr_snapshot=f"{product.barcode} / {parent.qr_payload}",
        qty_snapshot=parent.current_qty,
        qty_delta=Decimal("0.000"),
        batch_number_snapshot=parent.batch_number,
        production_date_snapshot=parent.production_date,
        storage_responsible_snapshot=data.storage_responsible.strip(),
        registered_at=now_utc,
        operator_id=actor.id,
        operator_name_snapshot=actor.full_name,
        to_location_name=target_store.name,
        to_store_id=target_store.id,
        from_location_name=current_store.name,
        from_store_id=current_store.id,
        balance_before_store=bal_curr_before,
        balance_after_store=bal_curr_after,
        state_changed_from=state_changed_from,
        notes=data.notes or f"Отправка партии № {parent.passport_code} целиком ({parent.current_qty} {unit_name})",
        custom_attributes=data.custom_attributes,
    )
    db.add(event)
    await db.commit()

    p_fresh = await get_passport_by_id(db, parent.id)
    return PassportDispatchResult(
        parent_passport=None,
        dispatched_passport=serialize_passport(p_fresh),
        split_occurred=False,
        remaining_qty_in_parent=Decimal("0.000"),
    )


async def accept_passport_receipt(
    db: AsyncSession, actor: User, passport_id: uuid.UUID, data: PassportAcceptReceiptCreate
) -> PassportRead:
    """Приемка ячейки на целевом складе / цехе (Handshake confirmation)."""
    if not actor.has_permission("can_inbound"):
        raise PermissionDeniedError("Нет прав на выполнение приемки (can_inbound)")

    stmt = (
        select(Passport)
        .where(Passport.id == passport_id)
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
            selectinload(Passport.pending_target_store),
        )
        .with_for_update()
    )
    res = await db.execute(stmt)
    passport = res.scalar_one_or_none()
    if not passport:
        raise NotFoundError("Паспорт ячейки не найден")

    if passport.status != PassportStatus.IN_TRANSIT.value:
        raise DomainValidationError(
            f"Невозможно принять ячейку в статусе {passport.status}. Ячейка должна быть IN_TRANSIT."
        )

    if not passport.pending_target_store_id:
        raise DomainValidationError("У перемещаемой ячейки не указан целевой склад.")

    if not actor.has_store_access(passport.pending_target_store_id):
        raise PermissionDeniedError("Нет доступа к целевому складу для завершения приемки.")

    target_res = await db.execute(select(Store).where(Store.id == passport.pending_target_store_id))
    target_store = target_res.scalar_one()

    orig_store_res = await db.execute(select(Store).where(Store.id == passport.current_store_id))
    orig_store = orig_store_res.scalar_one()

    product = passport.product

    old_state = passport.current_state
    new_state = data.state_at_receipt.strip()
    state_changed_from = old_state if old_state != new_state else None

    old_qty = passport.current_qty
    new_qty = data.actual_qty_at_receipt
    qty_delta = new_qty - old_qty

    new_status = (
        PassportStatus.IN_PRODUCTION.value
        if target_store.store_type == StoreType.PRODUCTION.value
        else PassportStatus.IN_STOCK.value
    )

    balance_before = await _calc_store_product_balance(db, target_store.id, product.id)
    balance_after = balance_before + new_qty

    now_utc = datetime.now(timezone.utc)

    passport.current_store_id = target_store.id
    passport.current_store = target_store
    passport.pending_target_store_id = None
    passport.pending_target_store = None
    passport.status = new_status
    passport.current_state = new_state
    passport.current_qty = new_qty
    passport.current_storage_responsible = data.storage_responsible.strip()
    passport.updated_at = now_utc

    event = PassportEvent(
        passport_id=passport.id,
        event_type=PassportEventType.ACCEPT_RECEIPT.value,
        state_snapshot=new_state,
        product_type_snapshot=passport.current_product_type,
        product_name_snapshot=product.name,
        barcode_qr_snapshot=f"{product.barcode} / {passport.qr_payload}",
        qty_snapshot=new_qty,
        qty_delta=qty_delta,
        batch_number_snapshot=passport.batch_number,
        production_date_snapshot=passport.production_date,
        storage_responsible_snapshot=data.storage_responsible.strip(),
        registered_at=now_utc,
        operator_id=actor.id,
        operator_name_snapshot=actor.full_name,
        to_location_name=target_store.name,
        to_store_id=target_store.id,
        from_location_name=orig_store.name,
        from_store_id=orig_store.id,
        balance_before_store=balance_before,
        balance_after_store=balance_after,
        state_changed_from=state_changed_from,
        notes=data.notes,
        custom_attributes=data.custom_attributes,
    )
    db.add(event)
    await db.commit()

    return serialize_passport(await get_passport_by_id(db, passport.id))


async def process_boning(
    db: AsyncSession, actor: User, source_passport_id: uuid.UUID, data: BoningProcessCreate
) -> dict[str, Any]:
    """
    ЭТАП 2 — Обвалка / Переработка сырья (Material Balance + Hierarchical Release 1.1 -> 1.1.1-1, 1.1.1-2, 1.1.1-3).
    """
    if not actor.has_permission("can_process"):
        raise PermissionDeniedError("Нет прав на проведение обвалки / переработки (can_process)")

    stmt = (
        select(Passport)
        .where(Passport.id == source_passport_id)
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
        )
        .with_for_update()
    )
    res = await db.execute(stmt)
    source = res.scalar_one_or_none()
    if not source:
        raise NotFoundError("Сырьевой паспорт не найден")

    if not actor.has_store_access(source.current_store_id):
        raise PermissionDeniedError("Нет доступа к производственному цеху")

    if source.status != PassportStatus.IN_PRODUCTION.value:
        raise DomainValidationError(
            f"Для обвалки сырье должно иметь статус IN_PRODUCTION (в цехе). Текущий статус: {source.status}."
        )

    store_res = await db.execute(select(Store).where(Store.id == source.current_store_id))
    production_store = store_res.scalar_one()

    target_res = await db.execute(select(Store).where(Store.id == data.target_store_id))
    target_store = target_res.scalar_one_or_none()
    if not target_store:
        raise NotFoundError("Целевой склад выпуска готовой продукции не найден")

    source_product = source.product

    input_qty = source.current_qty
    output_qty = sum(item.qty for item in data.output_items)

    if output_qty > input_qty:
        raise DomainValidationError(
            f"Нарушение материального баланса: сумма выхода готовой продукции ({output_qty} кг) "
            f"превышает входной вес сырья ({input_qty} кг)!"
        )

    loss_qty = input_qty - output_qty
    loss_percent = (
        round((loss_qty / input_qty) * Decimal("100.00"), 2)
        if input_qty > Decimal("0")
        else Decimal("0.00")
    )

    # Древовидная генерация кода акта обвалки: инкремент child_seq родителя (например 1.1 -> 1.1.1)
    source.child_seq = (source.child_seq or 0) + 1
    act_code = f"{source.passport_code}.{source.child_seq}"

    # Ensure uniqueness
    existing_act = await db.execute(
        select(ProcessingAct).where(ProcessingAct.act_code == act_code)
    )
    if existing_act.scalar_one_or_none():
        sub_idx = 2
        while True:
            candidate = f"{source.passport_code}.{source.child_seq}.{sub_idx}"
            if not (await db.execute(select(ProcessingAct).where(ProcessingAct.act_code == candidate))).scalar_one_or_none():
                act_code = candidate
                break
            sub_idx += 1

    now_utc = datetime.now(timezone.utc)

    # 1. ProcessingAct
    act = ProcessingAct(
        act_code=act_code,
        source_passport_id=source.id,
        store_id=production_store.id,
        target_store_id=target_store.id,
        performed_by_id=actor.id,
        performed_at=now_utc,
        input_qty=input_qty,
        output_qty=output_qty,
        loss_qty=loss_qty,
        loss_percent=loss_percent,
        notes=data.notes,
        created_at=now_utc,
    )
    db.add(act)
    await db.flush()

    # 2. Update source passport: PROCESSED, qty = 0
    balance_before_raw = await _calc_store_product_balance(db, production_store.id, source_product.id)
    balance_after_raw = max(Decimal("0.000"), balance_before_raw - input_qty)

    source.status = PassportStatus.PROCESSED.value
    source.current_qty = Decimal("0.000")
    source.processing_act_id = act.id
    source.updated_at = now_utc

    consume_event = PassportEvent(
        passport_id=source.id,
        event_type=PassportEventType.PROCESSING_CONSUME.value,
        state_snapshot=source.current_state,
        product_type_snapshot=source.current_product_type,
        product_name_snapshot=source_product.name,
        barcode_qr_snapshot=f"{source_product.barcode} / {source.qr_payload}",
        qty_snapshot=Decimal("0.000"),
        qty_delta=-input_qty,
        batch_number_snapshot=source.batch_number,
        production_date_snapshot=source.production_date,
        storage_responsible_snapshot=data.storage_responsible.strip(),
        registered_at=now_utc,
        operator_id=actor.id,
        operator_name_snapshot=actor.full_name,
        to_location_name=f"Акт обвалки № {act_code}",
        to_store_id=production_store.id,
        from_location_name=production_store.name,
        from_store_id=production_store.id,
        balance_before_store=balance_before_raw,
        balance_after_store=balance_after_raw,
        state_changed_from=None,
        notes=f"Списано в переработку (выход: {output_qty} кг, потери: {loss_qty} кг / {loss_percent}%)",
        custom_attributes={},
    )
    db.add(consume_event)

    # 3. Create child passports for each output item (e.g. 1.1.1-1, 1.1.1-2, 1.1.1-3)
    child_passports: list[Passport] = []
    prod_date = data.production_date or source.production_date
    batch_num = data.batch_number.strip() if data.batch_number else source.batch_number
    root_id = source.root_passport_id or source.id

    for idx, item in enumerate(data.output_items):
        child_code = f"{act_code}-{idx + 1}"
        child_qr = f"PKZ:{child_code}"
        child_lineage = f"{source.lineage_path or source.passport_code}.{source.child_seq}-{idx + 1}"

        out_prod_res = await db.execute(
            select(Product).where(Product.id == item.product_id).options(selectinload(Product.base_unit))
        )
        out_prod = out_prod_res.scalar_one_or_none()
        if not out_prod:
            raise NotFoundError(f"Товар для выхода {item.product_id} не найден")

        if data.direct_receive:
            child_status = PassportStatus.IN_STOCK.value
            child_store_id = target_store.id
            child_pending_store_id = None
            to_name = target_store.name
        else:
            child_status = PassportStatus.IN_TRANSIT.value
            child_store_id = production_store.id
            child_pending_store_id = target_store.id
            to_name = f"{target_store.name} (В пути)"

        child_p = Passport(
            passport_code=child_code,
            lineage_path=child_lineage,
            qr_payload=child_qr,
            root_passport_id=root_id,
            parent_passport_id=source.id,
            processing_act_id=act.id,
            child_seq=0,
            product_id=out_prod.id,
            batch_number=batch_num,
            production_date=prod_date,
            current_state=item.state.strip(),
            current_product_type=item.product_type.strip(),
            initial_qty=item.qty,
            current_qty=item.qty,
            current_store_id=child_store_id,
            pending_target_store_id=child_pending_store_id,
            current_storage_responsible=data.storage_responsible.strip(),
            status=child_status,
            custom_attributes=item.custom_attributes,
            created_by_operator_id=actor.id,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(child_p)
        await db.flush()

        bal_target_before = await _calc_store_product_balance(db, target_store.id, out_prod.id)
        bal_target_after = bal_target_before + (item.qty if data.direct_receive else Decimal("0.000"))

        child_event = PassportEvent(
            passport_id=child_p.id,
            event_type=PassportEventType.PROCESSING_PRODUCE.value,
            state_snapshot=item.state.strip(),
            product_type_snapshot=item.product_type.strip(),
            product_name_snapshot=out_prod.name,
            barcode_qr_snapshot=f"{out_prod.barcode} / {child_qr}",
            qty_snapshot=item.qty,
            qty_delta=item.qty,
            batch_number_snapshot=batch_num,
            production_date_snapshot=prod_date,
            storage_responsible_snapshot=data.storage_responsible.strip(),
            registered_at=now_utc,
            operator_id=actor.id,
            operator_name_snapshot=actor.full_name,
            to_location_name=to_name,
            to_store_id=target_store.id,
            from_location_name=f"Акт обвалки № {act_code} ({production_store.name})",
            from_store_id=production_store.id,
            balance_before_store=bal_target_before,
            balance_after_store=bal_target_after,
            state_changed_from=None,
            notes=f"Выпуск ГП из сырья {source.passport_code} ({source_product.name})",
            custom_attributes=item.custom_attributes,
        )
        db.add(child_event)
        child_passports.append(child_p)

    await db.commit()

    act_read = _serialize_act(
        (
            await db.execute(
                select(ProcessingAct)
                .where(ProcessingAct.id == act.id)
                .options(
                    selectinload(ProcessingAct.store),
                    selectinload(ProcessingAct.target_store),
                    selectinload(ProcessingAct.performed_by),
                )
            )
        ).scalar_one()
    )

    source_read = serialize_passport(await get_passport_by_id(db, source.id))
    children_reads = [serialize_passport(await get_passport_by_id(db, cp.id)) for cp in child_passports]

    return {
        "act": act_read,
        "source_passport": source_read,
        "child_passports": children_reads,
    }


async def get_genealogy_tree(
    db: AsyncSession, passport_id: uuid.UUID
) -> PassportGenealogyTree:
    """Двунаправленная HACCP-прослеживаемость + интерактивное дерево всей партии от корня."""
    current_passport = await get_passport_by_id(db, passport_id)

    # 1. Находим корень партии (Root Passport)
    root_id = current_passport.root_passport_id
    if not root_id:
        # Walk up parents if root_passport_id wasn't set
        curr = current_passport
        seen = {curr.id}
        while curr.parent_passport_id:
            if curr.parent_passport_id in seen:
                break
            seen.add(curr.parent_passport_id)
            parent = await get_passport_by_id(db, curr.parent_passport_id)
            curr = parent
        root_passport = curr
    else:
        root_passport = await get_passport_by_id(db, root_id)

    # 2. Загружаем все паспорта этой партии (по root_passport_id или parent_passport_id)
    all_family_stmt = (
        select(Passport)
        .where(
            or_(
                Passport.id == root_passport.id,
                Passport.root_passport_id == root_passport.id,
                Passport.parent_passport_id == root_passport.id,
            )
        )
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
            selectinload(Passport.events),
            selectinload(Passport.processing_act).selectinload(ProcessingAct.store),
            selectinload(Passport.processing_act).selectinload(ProcessingAct.target_store),
            selectinload(Passport.processing_act).selectinload(ProcessingAct.performed_by),
        )
        .order_by(Passport.created_at.asc())
    )
    all_family_res = await db.execute(all_family_stmt)
    all_passports = list(all_family_res.scalars().all())

    # Map children by parent_id
    children_by_parent: dict[uuid.UUID, list[Passport]] = {}
    passport_by_id_map: dict[uuid.UUID, Passport] = {}
    for p in all_passports:
        passport_by_id_map[p.id] = p
        if p.parent_passport_id:
            children_by_parent.setdefault(p.parent_passport_id, []).append(p)

    def _build_node(p: Passport) -> PassportGenealogyNode:
        kids = children_by_parent.get(p.id, [])
        # sort kids by code
        kids_sorted = sorted(kids, key=lambda x: x.passport_code)
        child_nodes = [_build_node(k) for k in kids_sorted]

        act_read = _serialize_act(p.processing_act) if p.processing_act else None
        unit = p.product.base_unit.name if (p.product and p.product.base_unit) else "кг"

        return PassportGenealogyNode(
            id=p.id,
            passport_code=p.passport_code,
            lineage_path=p.lineage_path or p.passport_code,
            qr_payload=p.qr_payload,
            product_name=p.product.name if p.product else "Товар",
            unit_name=unit,
            initial_qty=p.initial_qty or p.current_qty,
            current_qty=p.current_qty,
            current_state=p.current_state,
            current_product_type=p.current_product_type,
            current_store_name=p.current_store.name if p.current_store else "",
            current_store_type=p.current_store.store_type if p.current_store else "OTHER",
            status=p.status,
            processing_act=act_read,
            children=child_nodes,
        )

    tree_root = _build_node(root_passport)

    # Linear ancestors
    ancestors: list[PassportRead] = []
    curr = current_passport
    seen_anc = {curr.id}
    while curr.parent_passport_id:
        if curr.parent_passport_id in seen_anc:
            break
        seen_anc.add(curr.parent_passport_id)
        parent = passport_by_id_map.get(curr.parent_passport_id)
        if not parent:
            parent = await get_passport_by_id(db, curr.parent_passport_id)
        ancestors.append(serialize_passport(parent))
        curr = parent

    # Linear descendants
    descendants: list[PassportRead] = []
    queue = [current_passport.id]
    visited_desc = set(queue)
    while queue:
        pid = queue.pop(0)
        kids = children_by_parent.get(pid, [])
        for k in kids:
            if k.id not in visited_desc:
                visited_desc.add(k.id)
                queue.append(k.id)
                descendants.append(serialize_passport(k))

    act_read = (
        _serialize_act(current_passport.processing_act)
        if current_passport.processing_act
        else None
    )

    return PassportGenealogyTree(
        current=serialize_passport(current_passport),
        processing_act=act_read,
        tree_root=tree_root,
        ancestors=ancestors,
        descendants=descendants,
    )


async def list_in_transit_passports(
    db: AsyncSession, store_id: uuid.UUID | None = None
) -> list[PassportRead]:
    """Список ячеек, находящихся в пути (IN_TRANSIT)."""
    stmt = (
        select(Passport)
        .where(Passport.status == PassportStatus.IN_TRANSIT.value)
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
            selectinload(Passport.pending_target_store),
            selectinload(Passport.created_by),
            selectinload(Passport.events),
            selectinload(Passport.processing_act),
        )
    )
    if store_id:
        stmt = stmt.where(Passport.pending_target_store_id == store_id)

    stmt = stmt.order_by(Passport.updated_at.desc())
    res = await db.execute(stmt)
    return [serialize_passport(p) for p in res.scalars().all()]


async def get_store_passport_inventory_summary(
    db: AsyncSession, store_id: uuid.UUID
) -> StorePassportInventorySummary:
    """Агрегированные остатки склада по активным паспортам (например СГП: 30 + 60 = 90 кг)."""
    store_res = await db.execute(select(Store).where(Store.id == store_id))
    store = store_res.scalar_one_or_none()
    if not store:
        raise NotFoundError("Склад не найден")

    stmt = (
        select(Passport)
        .where(
            Passport.current_store_id == store_id,
            Passport.status.in_([PassportStatus.IN_STOCK.value, PassportStatus.IN_PRODUCTION.value]),
        )
        .options(
            selectinload(Passport.product).selectinload(Product.base_unit),
            selectinload(Passport.current_store),
            selectinload(Passport.events),
            selectinload(Passport.processing_act),
        )
        .order_by(Passport.created_at.desc())
    )
    res = await db.execute(stmt)
    active_passports = list(res.scalars().all())

    in_transit_res = await db.execute(
        select(func.count(Passport.id)).where(
            Passport.pending_target_store_id == store_id,
            Passport.status == PassportStatus.IN_TRANSIT.value,
        )
    )
    in_transit_count = in_transit_res.scalar() or 0

    by_product: dict[uuid.UUID, dict[str, Any]] = {}
    total_store_stock = Decimal("0.000")

    for p in active_passports:
        total_store_stock += p.current_qty
        pid = p.product_id

        if pid not in by_product:
            unit_name = "кг"
            if p.product and p.product.base_unit:
                unit_name = p.product.base_unit.name

            by_product[pid] = {
                "product_id": pid,
                "product_name": p.product.name if p.product else "Товар",
                "barcode": p.product.barcode if p.product else "",
                "sku": p.product.sku if p.product else "",
                "unit_name": unit_name,
                "total_qty": Decimal("0.000"),
                "passports_count": 0,
                "by_state": {},
                "by_product_type": {},
                "passports": [],
            }

        group = by_product[pid]
        group["total_qty"] += p.current_qty
        group["passports_count"] += 1

        state = p.current_state or "Не указано"
        group["by_state"][state] = group["by_state"].get(state, Decimal("0.000")) + p.current_qty

        ptype = p.current_product_type or "Не указано"
        group["by_product_type"][ptype] = (
            group["by_product_type"].get(ptype, Decimal("0.000")) + p.current_qty
        )

        group["passports"].append(serialize_passport(p))

    products_list = [
        StorePassportAggregatedProduct(
            product_id=g["product_id"],
            product_name=g["product_name"],
            barcode=g["barcode"],
            sku=g["sku"],
            unit_name=g["unit_name"],
            total_qty=g["total_qty"],
            passports_count=g["passports_count"],
            by_state=g["by_state"],
            by_product_type=g["by_product_type"],
            passports=g["passports"],
        )
        for g in by_product.values()
    ]

    return StorePassportInventorySummary(
        store_id=store.id,
        store_name=store.name,
        store_code=store.code,
        store_type=store.store_type,
        total_stock=total_store_stock,
        products_count=len(products_list),
        passports_count=len(active_passports),
        in_transit_incoming_count=in_transit_count,
        products=products_list,
    )
