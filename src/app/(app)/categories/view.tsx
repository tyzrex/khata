"use client";

import { CategoriesView } from "@/components/categories-view";
import { useKhata } from "@/components/khata-provider";

export function CategoriesPage() {
  const { ledger } = useKhata();
  return <CategoriesView categories={ledger.categories} onSave={ledger.saveCategory} onDelete={ledger.removeCategory} />;
}
