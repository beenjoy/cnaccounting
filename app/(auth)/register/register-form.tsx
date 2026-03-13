"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";

const createSchema = z.object({
  name: z.string().min(2, "姓名至少2个字符"),
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少6位"),
  organizationName: z.string().min(2, "组织名称至少2个字符"),
  companyName: z.string().min(2, "公司名称至少2个字符"),
});

const joinSchema = z.object({
  name: z.string().min(2, "姓名至少2个字符"),
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少6位"),
  inviteCode: z.string().min(1, "请输入邀请码"),
});

type CreateFormData = z.infer<typeof createSchema>;
type JoinFormData = z.infer<typeof joinSchema>;

export function RegisterForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [mode, setMode] = useState<"create" | "join">("create");

  const createForm = useForm<CreateFormData>({ resolver: zodResolver(createSchema) });
  const joinForm = useForm<JoinFormData>({ resolver: zodResolver(joinSchema) });

  const handleSubmit = async (formData: CreateFormData | JoinFormData) => {
    setIsPending(true);
    try {
      const payload = mode === "create"
        ? { mode: "create", ...formData }
        : { mode: "join", ...formData };

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "注册失败");
        return;
      }

      const email = (formData as { email: string }).email;
      const password = (formData as { password: string }).password;

      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        toast.success("注册成功，请登录");
        router.push("/login");
      } else {
        toast.success("注册成功，欢迎使用！");
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex rounded-lg border overflow-hidden">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === "create"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          创建新组织
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            mode === "join"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          加入已有组织
        </button>
      </div>

      {mode === "create" ? (
        <form onSubmit={createForm.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">姓名</Label>
            <Input id="name" placeholder="张三" {...createForm.register("name")} />
            {createForm.formState.errors.name && (
              <p className="text-sm text-red-500">{createForm.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" type="email" placeholder="your@email.com" {...createForm.register("email")} />
            {createForm.formState.errors.email && (
              <p className="text-sm text-red-500">{createForm.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input id="password" type="password" placeholder="至少6位" {...createForm.register("password")} />
            {createForm.formState.errors.password && (
              <p className="text-sm text-red-500">{createForm.formState.errors.password.message}</p>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">组织信息</p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="organizationName">组织名称</Label>
                <Input
                  id="organizationName"
                  placeholder="例：某集团有限公司"
                  {...createForm.register("organizationName")}
                />
                {createForm.formState.errors.organizationName && (
                  <p className="text-sm text-red-500">{createForm.formState.errors.organizationName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">默认公司名称</Label>
                <Input
                  id="companyName"
                  placeholder="例：北京分公司"
                  {...createForm.register("companyName")}
                />
                {createForm.formState.errors.companyName && (
                  <p className="text-sm text-red-500">{createForm.formState.errors.companyName.message}</p>
                )}
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            注册并创建组织
          </Button>
        </form>
      ) : (
        <form onSubmit={joinForm.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-name">姓名</Label>
            <Input id="join-name" placeholder="张三" {...joinForm.register("name")} />
            {joinForm.formState.errors.name && (
              <p className="text-sm text-red-500">{joinForm.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-email">邮箱</Label>
            <Input id="join-email" type="email" placeholder="your@email.com" {...joinForm.register("email")} />
            {joinForm.formState.errors.email && (
              <p className="text-sm text-red-500">{joinForm.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-password">密码</Label>
            <Input id="join-password" type="password" placeholder="至少6位" {...joinForm.register("password")} />
            {joinForm.formState.errors.password && (
              <p className="text-sm text-red-500">{joinForm.formState.errors.password.message}</p>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">加入组织</p>
            <div className="space-y-2">
              <Label htmlFor="inviteCode">邀请码</Label>
              <Input
                id="inviteCode"
                placeholder="请输入组织管理员提供的邀请码"
                {...joinForm.register("inviteCode")}
              />
              {joinForm.formState.errors.inviteCode && (
                <p className="text-sm text-red-500">{joinForm.formState.errors.inviteCode.message}</p>
              )}
              <p className="text-xs text-muted-foreground">邀请码可在「组织设置」页面获取</p>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            注册并加入组织
          </Button>
        </form>
      )}
    </div>
  );
}
