"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TemplateManagerProps {
  companyId: string;
  hasSystemSeed: boolean;
  mode: "header-actions" | "empty-state" | "delete";
  templateId?: string;
  templateName?: string;
}

export function TemplateManager({
  companyId,
  hasSystemSeed,
  mode,
  templateId,
  templateName,
}: TemplateManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Seed system templates ──────────────────────────────────
  async function handleSeed() {
    const res = await fetch(`/api/journal-templates/seed?companyId=${companyId}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "导入失败"); return; }
    toast.success(data.message);
    startTransition(() => router.refresh());
  }

  // ── Delete template ────────────────────────────────────────
  async function handleDelete() {
    if (!templateId) return;
    const res = await fetch(`/api/journal-templates/${templateId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "删除失败"); return; }
    toast.success("模板已删除");
    setShowDeleteConfirm(false);
    startTransition(() => router.refresh());
  }

  // ── Create template ────────────────────────────────────────
  const [form, setForm] = useState({
    name: "", description: "", category: "",
    lines: [
      { direction: "DEBIT", accountCode: "", description: "" },
      { direction: "CREDIT", accountCode: "", description: "" },
    ],
  });

  function addLine() {
    setForm((f) => ({
      ...f,
      lines: [...f.lines, { direction: "DEBIT", accountCode: "", description: "" }],
    }));
  }

  function removeLine(i: number) {
    setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  }

  function updateLine(i: number, field: string, value: string) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l),
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("请输入模板名称"); return; }
    if (form.lines.length < 2) { toast.error("至少需要2行"); return; }

    const res = await fetch("/api/journal-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        name: form.name,
        description: form.description,
        category: form.category,
        lines: form.lines,
      }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "创建失败"); return; }
    toast.success("模板已创建");
    setShowCreate(false);
    setForm({ name: "", description: "", category: "", lines: [{ direction: "DEBIT", accountCode: "", description: "" }, { direction: "CREDIT", accountCode: "", description: "" }] });
    startTransition(() => router.refresh());
  }

  // ── Render ─────────────────────────────────────────────────
  if (mode === "delete") {
    return (
      <>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
          title="删除模板"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 w-80 space-y-4">
              <p className="font-medium">确认删除模板</p>
              <p className="text-sm text-muted-foreground">确定要删除「{templateName}」吗？此操作不可撤销。</p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
                <Button variant="destructive" size="sm" disabled={isPending} onClick={handleDelete}>删除</Button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (mode === "empty-state") {
    return (
      <div className="flex gap-3 justify-center">
        <Button variant="outline" onClick={handleSeed} disabled={isPending}>
          <Download className="h-4 w-4 mr-2" />
          导入系统内置模板
        </Button>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新建模板
        </Button>
        <CreateModal
          show={showCreate}
          form={form}
          setForm={setForm}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
          addLine={addLine}
          removeLine={removeLine}
          updateLine={updateLine}
        />
      </div>
    );
  }

  // header-actions
  return (
    <div className="flex items-center gap-2">
      {!hasSystemSeed && (
        <Button variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>
          <Download className="h-4 w-4 mr-1.5" />
          导入内置模板
        </Button>
      )}
      <Button size="sm" onClick={() => setShowCreate(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        新建模板
      </Button>
      <CreateModal
        show={showCreate}
        form={form}
        setForm={setForm}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        addLine={addLine}
        removeLine={removeLine}
        updateLine={updateLine}
      />
    </div>
  );
}

// ── Create Modal ───────────────────────────────────────────────────────────

type FormState = {
  name: string;
  description: string;
  category: string;
  lines: { direction: string; accountCode: string; description: string }[];
};

function CreateModal({
  show, form, setForm, onClose, onSubmit, addLine, removeLine, updateLine,
}: {
  show: boolean;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  addLine: () => void;
  removeLine: (i: number) => void;
  updateLine: (i: number, field: string, value: string) => void;
}) {
  if (!show) return null;

  const CATEGORIES = ["采购", "销售", "增值税", "工资", "固定资产", "期末调整", "所得税", "资金往来", "其他"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">新建凭证模板</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">模板名称 *</label>
              <input
                className="w-full h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="如：采购原材料赊购"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">分类</label>
              <select
                className="w-full h-9 rounded-md border px-3 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">选择分类（可选）</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">说明</label>
            <input
              className="w-full h-9 rounded-md border px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="模板用途说明（可选）"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">分录行 *</label>
              <button type="button" onClick={addLine} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" />添加行
              </button>
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">科目编码</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground w-20">借/贷</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">行摘要</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {form.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input
                          className="w-full h-7 rounded border px-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="如 1002"
                          value={line.accountCode}
                          onChange={(e) => updateLine(i, "accountCode", e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <select
                          className="h-7 w-16 rounded border px-1 text-sm bg-background focus:outline-none"
                          value={line.direction}
                          onChange={(e) => updateLine(i, "direction", e.target.value)}
                        >
                          <option value="DEBIT">借</option>
                          <option value="CREDIT">贷</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-full h-7 rounded border px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="行摘要（可选）"
                          value={line.description}
                          onChange={(e) => updateLine(i, "description", e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-2">
                        {form.lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit">创建模板</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
