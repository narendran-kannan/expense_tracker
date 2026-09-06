export interface MobileTransaction {
  id: string;
  amount: number;
  effectiveAmount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory: string | null;
  is_cc_payment: boolean;
  confidence_score: number;
  needs_review: boolean;
  remarks: string | null;
  is_emi?: boolean | null;
  recoverable_amount?: number | null;
  isEmiInstallment?: boolean;
}

export interface MobileCategorySlice {
  name: string;
  amount: number;
  pct: number;
}

export interface MobileDaySpend {
  label: string;
  amount: number;
}

export interface MobileMoreItem {
  href: string;
  label: string;
  sub: string;
  value: string;
}

export interface MobileCategoryOption {
  name: string;
  subcategories: { id: string; name: string }[];
}

export type MobileTab = "home" | "activity" | "insights" | "more";
