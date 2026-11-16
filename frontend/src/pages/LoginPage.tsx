import { useState } from "react";
import { AlertCircle, Lock, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Не удалось подключиться к серверу");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm border-[#E2E8F0] bg-white shadow-md">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#DC2626] text-white flex items-center justify-center shadow-sm mb-3">
              <Warehouse className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#0F172A]">
              WMS <span className="text-[#DC2626]">CORE</span>
            </h1>
            <p className="mt-1 text-xs font-medium text-[#64748B]">
              Складской и товарный учет
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#DC2626]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="login-username">Логин / Табельный номер</Label>
              <Input
                id="login-username"
                className="h-11"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="operator / manager / admin"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">Пароль</Label>
              <Input
                id="login-password"
                type="password"
                className="h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full h-11 mt-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-medium"
              disabled={loading}
            >
              <Lock className="h-4 w-4" />
              {loading ? "Вход..." : "Войти"}
            </Button>
          </form>

          <div className="mt-6 border-t border-[#E2E8F0] pt-4 text-center text-xs text-[#94A3B8]">
            Корпоративный контур склада
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
