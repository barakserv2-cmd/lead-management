export type ClientType = "Hotel" | "Restaurant" | "Construction" | "Other";
export type ClientStatus = "Active" | "Frozen" | "Debt";

export interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  type: ClientType;
  status: ClientStatus;
  city: string | null;
  created_at: string;
}
