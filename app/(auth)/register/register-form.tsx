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

const schema = z.object({
  name: z.string().min(2, "姓名至少2个字符"),
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少6位"),
  organizationName: z.string().min(2, "组织名称至少2个字符"),
  companyName: z.string().min(2, "公司名称至少2个字符"),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setIsPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "注册失败");
        return;
      }

      // 自动登录
      const signInResult = await signIn("credentials", {
        email: data.email,
        password: data.password,
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">姓名</Label>
        <Input id="name" placeholder="张三" {...register("name")} />
        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input id="email" type="email" placeholder="your@email.com" {...register("email")} />
        {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input id="password" type="password" placeholder="至少6位" {...register("password")} />
        {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
      </div>

      <div className="border-t pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">组织信息</p>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="organizationName">组织名称</Label>
            <Input
              id="organizationName"
              placeholder="例：某集团有限公司"
              {...register("organizationName")}
            />
            {errors.organizationName && (
              <p className="text-sm text-red-500">{errors.organizationName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyName">默认公司名称</Label>
            <Input
              id="companyName"
              placeholder="例：北京分公司"
              {...register("companyName")}
            />
            {errors.companyName && (
              <p className="text-sm text-red-500">{errors.companyName.message}</p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        注册并创建组织
      </Button>
    </form>
  );
}
