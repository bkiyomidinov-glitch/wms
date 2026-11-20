from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, or_
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
    PassportEventRead,
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
        qr_payload=p.qr_payload,
        parent_passport_id=p.parent_passport_id,
        parent_passport_code=p.parent_passport.passport_code if p.parent_passport else None,
        processing_act_id=p.processing_act_id,
        product_id=p.product_id,
        product_name=p.product.name if p.product else "Товар",
        product_barcode=p.product.barcode if p.product else "",
        product_sku=p.product.sku if p.product else "",
        unit_name=unit_name,
        batch_number=p.batch_number,
        production_date=p.production_date,
        current_state=p.current_state,
        current_product_type=p.current_product_type,
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
            selectinload(Passport.product),
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

    # Strip optional prefix 'PKZ:' for direct code match
    clean_code = q
    if q.upper().startswith("PKZ:"):
        clean_code = q[4:].strip()

    stmt = (
        select(Passport)
        .join(Passport.product)
        .where(
            or_(
                Passport.passport_code.ilike(clean_code),
                Passport.qr_payload.ilike(q),
                Passport.qr_payload.ilike(f"PKZ:{clean_code}"),
                Product.barcode == q,
                Passport.batch_number.ilike(f"%{q}%"),
            )
        )
        .options(
            selectinload(Passport.product),
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


async def generate_next_passport_code(
    db: AsyncSession, parent_code: str | None = None
) -> str:
    """Генерирует иерархический код паспорта: 1, 2, 3 или 1.1-1, 1.1-2."""
    if parent_code:
        # e.g. for boning act 1.1 -> child codes 1.1-1, 1.1-2
        pattern = f"{parent_code}-%"
        res = await db.execute(
            select(Passport.passport_code)
            .where(Passport.passport_code.like(pattern))
            .order_by(Passport.created_at.desc())
        )
        existing = res.scalars().all()
        max_idx = 0
        prefix = f"{parent_code}-"
        for code in existing:
            suffix = code[len(prefix):]
            if suffix.isdigit():
                max_idx = max(max_idx, int(suffix))
        return f"{parent_code}-{max_idx + 1}"

    # Top-level code: simple numeric sequence 1, 2, 3...
    res = await db.execute(select(Passport.passport_code))
    codes = res.scalars().all()
    max_num = 0
    for c in codes:
        if c.isdigit():
            max_num = max(max_num, int(c))
    return str(max_num + 1)


async def create_initial_receipt(
    db: AsyncSession, actor: User, data: InitialReceiptCreate
) -> PassportRead:
    """ЭТАП ① — Первичная приемка сырья с созданием паспорта № id X."""
    if not actor.has_permission("can_inbound"):
        raise PermissionDeniedError("Нет прав на выполнение приемки (can_inbound)")
    if not actor.has_store_access(data.store_id):
        raise PermissionDeniedError("Нет доступа к указанному складу")

    prod_res = await db.execute(select(Product).where(Product.id == data.product_id))
    product = prod_res.scalar_one_or_none()
    if not product:
        raise NotFoundError("Товар не найден")

    store_res = await db.execute(select(Store).where(Store.id == data.store_id))
    store = store_res.scalar_one_or_none()
    if not store:
        raise NotFoundError("Склад не найден")

    # Generate sequential code
    code = await generate_next_passport_code(db)
    qr_payload = f"PKZ:{code}"

    # Calculate balance before & after
    balance_before = await _calc_store_product_balance(db, store.id, product.id)
    balance_after = balance_before + data.qty

    now_utc = datetime.now(timezone.utc)

    passport = Passport(
        passport_code=code,
        qr_payload=qr_payload,
        parent_passport_id=None,
        processing_act_id=None,
        product_id=product.id,
        batch_number=data.batch_number.strip(),
        production_date=data.production_date,
        current_state=data.state.strip(),
        current_product_type=data.product_type.strip(),
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
) -> PassportRead:
    """Отправка ячейки: фиксация нового состояния и контрольного веса, перевод в IN_TRANSIT."""
    if not actor.has_permission("can_outbound"):
        raise PermissionDeniedError("Нет прав на выполнение отправки (can_outbound)")

    # Row-Level Locking SELECT ... FOR UPDATE
    stmt = (
        select(Passport)
        .where(Passport.id == passport_id)
        .with_for_update()
    )
    res = await db.execute(stmt)
    passport = res.scalar_one_or_none()
    if not passport:
        raise NotFoundError("Паспорт ячейки не найден")

    if not actor.has_store_access(passport.current_store_id):
        raise PermissionDeniedError("Нет доступа к складу отправления")

    if passport.status not in (PassportStatus.IN_STOCK.value, PassportStatus.IN_PRODUCTION.value):
        raise DomainValidationError(
            f"Невозможно отправить паспорт в статусе {passport.status}. Требуется IN_STOCK или IN_PRODUCTION."
        )

    target_res = await db.execute(select(Store).where(Store.id == data.target_store_id))
    target_store = target_res.scalar_one_or_none()
    if not target_store:
        raise NotFoundError("Целевой склад не найден")

    current_store_res = await db.execute(select(Store).where(Store.id == passport.current_store_id))
    current_store = current_store_res.scalar_one()

    product_res = await db.execute(select(Product).where(Product.id == passport.product_id))
    product = product_res.scalar_one()

    # Track state change & weight delta
    old_state = passport.current_state
    new_state = data.state_at_dispatch.strip()
    state_changed_from = old_state if old_state != new_state else None

    old_qty = passport.current_qty
    new_qty = data.actual_qty_at_dispatch
    qty_delta = new_qty - old_qty  # e.g. -1.5 for shrinkage

    # Calculate balance on dispatching store
    balance_before = await _calc_store_product_balance(db, current_store.id, product.id)
    balance_after = max(Decimal("0.000"), balance_before - old_qty)

    now_utc = datetime.now(timezone.utc)

    # Update passport
    passport.status = PassportStatus.IN_TRANSIT.value
    passport.pending_target_store_id = target_store.id
    passport.pending_target_store = target_store
    passport.current_state = new_state
    passport.current_qty = new_qty
    passport.current_storage_responsible = data.storage_responsible.strip()
    passport.updated_at = now_utc

    # Record dispatch snapshot event
    event = PassportEvent(
        passport_id=passport.id,
        event_type=PassportEventType.DISPATCH.value,
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
        from_location_name=current_store.name,
        from_store_id=current_store.id,
        balance_before_store=balance_before,
        balance_after_store=balance_after,
        state_changed_from=state_changed_from,
        notes=data.notes,
        custom_attributes=data.custom_attributes,
    )
    db.add(event)
    await db.commit()

    return serialize_passport(await get_passport_by_id(db, passport.id))


async def accept_passport_receipt(
    db: AsyncSession, actor: User, passport_id: uuid.UUID, data: PassportAcceptReceiptCreate
) -> PassportRead:
    """Приемка ячейки на целевом складе / цехе (Handshake confirmation)."""
    if not actor.has_permission("can_inbound"):
        raise PermissionDeniedError("Нет прав на выполнение приемки (can_inbound)")

    # Row-Level Locking SELECT ... FOR UPDATE
    stmt = (
        select(Passport)
        .where(Passport.id == passport_id)
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

    product_res = await db.execute(select(Product).where(Product.id == passport.product_id))
    product = product_res.scalar_one()

    # Track state change & weight delta
    old_state = passport.current_state
    new_state = data.state_at_receipt.strip()
    state_changed_from = old_state if old_state != new_state else None

    old_qty = passport.current_qty
    new_qty = data.actual_qty_at_receipt
    qty_delta = new_qty - old_qty

    # Target status: if target store is PRODUCTION (Цех обвалки), status -> IN_PRODUCTION, else IN_STOCK
    new_status = (
        PassportStatus.IN_PRODUCTION.value
        if target_store.store_type == StoreType.PRODUCTION.value
        else PassportStatus.IN_STOCK.value
    )

    # Calculate balance on target store
    balance_before = await _calc_store_product_balance(db, target_store.id, product.id)
    balance_after = balance_before + new_qty

    now_utc = datetime.now(timezone.utc)

    # Complete handshake
    passport.current_store_id = target_store.id
    passport.pending_target_store_id = None
    passport.status = new_status
    passport.current_state = new_state
    passport.current_qty = new_qty
    passport.current_storage_responsible = data.storage_responsible.strip()
    passport.updated_at = now_utc

    # Record accept receipt event
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
    """ЭТАП ② — Обвалка / Переработка сырья с расчетом материального баланса потерь."""
    if not actor.has_permission("can_process"):
        raise PermissionDeniedError("Нет прав на проведение обвалки / переработки (can_process)")

    # Row-Level Locking SELECT ... FOR UPDATE
    stmt = (
        select(Passport)
        .where(Passport.id == source_passport_id)
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

    # Fetch store & product
    store_res = await db.execute(select(Store).where(Store.id == source.current_store_id))
    production_store = store_res.scalar_one()

    target_res = await db.execute(select(Store).where(Store.id == data.target_store_id))
    target_store = target_res.scalar_one_or_none()
    if not target_store:
        raise NotFoundError("Целевой склад выпуска готовой продукции не найден")

    source_product_res = await db.execute(select(Product).where(Product.id == source.product_id))
    source_product = source_product_res.scalar_one()

    # Mass balance calculation
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

    # Generate Act Code: e.g. "1.1" or parent_code.1
    act_code = f"{source.passport_code}.1"
    # Check uniqueness
    existing_act = await db.execute(
        select(ProcessingAct).where(ProcessingAct.act_code == act_code)
    )
    if existing_act.scalar_one_or_none():
        # Append suffix if needed
        sub_idx = 2
        while True:
            candidate = f"{source.passport_code}.{sub_idx}"
            if not (await db.execute(select(ProcessingAct).where(ProcessingAct.act_code == candidate))).scalar_one_or_none():
                act_code = candidate
                break
            sub_idx += 1

    now_utc = datetime.now(timezone.utc)

    # 1. Create ProcessingAct
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

    # Event for source: PROCESSING_CONSUME
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

    # 3. Create child passports for each output item
    child_passports: list[Passport] = []
    prod_date = data.production_date or source.production_date
    batch_num = data.batch_number.strip() if data.batch_number else source.batch_number

    for idx, item in enumerate(data.output_items):
        child_code = f"{act_code}-{idx + 1}"
        child_qr = f"PKZ:{child_code}"

        out_prod_res = await db.execute(select(Product).where(Product.id == item.product_id))
        out_prod = out_prod_res.scalar_one_or_none()
        if not out_prod:
            raise NotFoundError(f"Товар для выхода {item.product_id} не найден")

        # Destination status
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
            qr_payload=child_qr,
            parent_passport_id=source.id,
            processing_act_id=act.id,
            product_id=out_prod.id,
            batch_number=batch_num,
            production_date=prod_date,
            current_state=item.state.strip(),
            current_product_type=item.product_type.strip(),
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

    # Re-fetch populated models
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
    """Двунаправленная HACCP-прослеживаемость (дерево предков и потомков)."""
    current_passport = await get_passport_by_id(db, passport_id)

    # 1. Walk upwards to ancestors
    ancestors: list[PassportRead] = []
    curr = current_passport
    seen = {curr.id}
    while curr.parent_passport_id:
        if curr.parent_passport_id in seen:
            break
        seen.add(curr.parent_passport_id)
        parent = await get_passport_by_id(db, curr.parent_passport_id)
        ancestors.append(serialize_passport(parent))
        curr = parent

    # 2. Walk downwards to descendants
    descendants: list[PassportRead] = []
    queue = [current_passport.id]
    visited_desc = set(queue)

    while queue:
        pid = queue.pop(0)
        res = await db.execute(
            select(Passport.id).where(Passport.parent_passport_id == pid)
        )
        child_ids = res.scalars().all()
        for cid in child_ids:
            if cid not in visited_desc:
                visited_desc.add(cid)
                queue.append(cid)
                child_p = await get_passport_by_id(db, cid)
                descendants.append(serialize_passport(child_p))

    act_read = (
        _serialize_act(current_passport.processing_act)
        if current_passport.processing_act
        else None
    )

    return PassportGenealogyTree(
        current=serialize_passport(current_passport),
        processing_act=act_read,
        ancestors=ancestors,
        descendants=descendants,
    )


async def list_in_transit_passports(
    db: AsyncSession, store_id: uuid.UUID | None = None
) -> list[PassportRead]:
    """Список ячеек, ожидающих приемки на складе (IN_TRANSIT)."""
    stmt = (
        select(Passport)
        .where(Passport.status == PassportStatus.IN_TRANSIT.value)
        .options(
            selectinload(Passport.product),
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
    """Агрегированные остатки по активным паспортам на складе (например СГП: 30 + 60 = 90 кг)."""
    store_res = await db.execute(select(Store).where(Store.id == store_id))
    store = store_res.scalar_one_or_none()
    if not store:
        raise NotFoundError("Склад не найден")

    # Fetch active passports on this store
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

    # Count incoming in-transit
    in_transit_res = await db.execute(
        select(func.count(Passport.id)).where(
            Passport.pending_target_store_id == store_id,
            Passport.status == PassportStatus.IN_TRANSIT.value,
        )
    )
    in_transit_count = in_transit_res.scalar() or 0

    # Group by product
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
