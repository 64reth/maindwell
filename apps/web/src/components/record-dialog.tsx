"use client";

import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import type { ClientRecord, ContractorRecord, PropertyRecord, RecordKind } from "@/lib/types";

const trades = ["Plumbing", "Electrical", "Heating", "Roofing", "General maintenance", "Locksmith", "Drainage", "Cleaning", "Other"];

type RecordDialogProps = {
  kind: RecordKind;
  initial?: Record<string, unknown>;
  clients: ClientRecord[];
  properties: PropertyRecord[];
  contractors: ContractorRecord[];
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
};

export default function RecordDialog({ kind, initial, clients, properties, contractors, onClose, onSubmit }: RecordDialogProps) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial?.id);
  const titles: Record<RecordKind, string> = {
    client: editing ? "Edit client" : "Add client",
    property: editing ? "Edit property" : "Add property",
    contractor: editing ? "Edit contractor" : "Register contractor",
    job: editing ? "Edit job" : "Create maintenance request",
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const data = new FormData(event.currentTarget);
    let payload: Record<string, unknown>;

    if (kind === "client") {
      payload = { type: data.get("type"), name: data.get("name"), contact_name: data.get("contact_name"), email: data.get("email"), phone: data.get("phone") };
    } else if (kind === "property") {
      payload = { client_id: data.get("client_id"), address_line_1: data.get("address_line_1"), address_line_2: data.get("address_line_2") || null, city: data.get("city"), postcode: String(data.get("postcode") || "").trim().toUpperCase(), property_type: data.get("property_type"), access_notes: data.get("access_notes") || null };
    } else if (kind === "contractor") {
      const selectedTrades = data.getAll("trades");
      if (selectedTrades.length === 0) {
        setError("Select at least one trade for this contractor.");
        setSaving(false);
        return;
      }
      payload = { business_name: data.get("business_name"), contact_name: data.get("contact_name"), email: data.get("email"), phone: data.get("phone"), trades: selectedTrades, verification_status: data.get("verification_status"), notes: data.get("notes") || null };
    } else {
      payload = { property_id: data.get("property_id"), title: data.get("title"), trade: data.get("trade"), description: data.get("description"), priority: data.get("priority"), due_date: data.get("due_date") || null };
    }

    try {
      await onSubmit(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this record.");
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="record-dialog-title">
        <header className="dialog-header"><div><span className="eyebrow">{editing ? "Record details" : "New record"}</span><h2 id="record-dialog-title">{titles[kind]}</h2></div><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={19} /></button></header>
        <form className="record-form" onSubmit={submit}>
          {kind === "client" && <>
            <label>Client type<select name="type" defaultValue={initial?.type as string || "landlord"} required><option value="landlord">Landlord</option><option value="letting_agent">Letting agent</option></select></label>
            <label>Landlord or agency name<input name="name" defaultValue={initial?.name as string} required maxLength={120} /></label>
            <label>Primary contact<input name="contact_name" defaultValue={initial?.contact_name as string} required maxLength={120} /></label>
            <div className="field-row"><label>Email address<input type="email" name="email" defaultValue={initial?.email as string} required /></label><label>Phone number<input type="tel" name="phone" defaultValue={initial?.phone as string} required /></label></div>
          </>}
          {kind === "property" && <>
            <label>Client<select name="client_id" defaultValue={initial?.client_id as string || ""} required><option value="" disabled>Select a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <label>Address line 1<input name="address_line_1" defaultValue={initial?.address_line_1 as string} required maxLength={160} /></label>
            <label>Address line 2 <span className="optional">Optional</span><input name="address_line_2" defaultValue={initial?.address_line_2 as string || ""} maxLength={160} /></label>
            <div className="field-row"><label>Town or city<input name="city" defaultValue={initial?.city as string} required maxLength={100} /></label><label>Postcode<input name="postcode" defaultValue={initial?.postcode as string} required minLength={5} maxLength={10} autoCapitalize="characters" /></label></div>
            <label>Property type<select name="property_type" defaultValue={initial?.property_type as string || "Residential"}><option>Residential</option><option>Flat</option><option>House</option><option>Commercial</option><option>Other</option></select></label>
            <label>Access notes <span className="optional">Optional</span><textarea name="access_notes" defaultValue={initial?.access_notes as string || ""} rows={2} maxLength={1000} /></label>
          </>}
          {kind === "contractor" && <>
            <label>Business name<input name="business_name" defaultValue={initial?.business_name as string} required maxLength={120} /></label>
            <label>Primary contact<input name="contact_name" defaultValue={initial?.contact_name as string} required maxLength={120} /></label>
            <div className="field-row"><label>Email address<input type="email" name="email" defaultValue={initial?.email as string} required /></label><label>Phone number<input type="tel" name="phone" defaultValue={initial?.phone as string} required /></label></div>
            <fieldset className="trade-fieldset"><legend>Trades <span className="optional">Choose all that apply</span></legend><div className="trade-options">{trades.map((trade) => <label className="check-option" key={trade}><input type="checkbox" name="trades" value={trade} defaultChecked={(initial?.trades as string[] | undefined)?.includes(trade)} /><span>{trade}</span></label>)}</div></fieldset>
            <label>Verification status<select name="verification_status" defaultValue={initial?.verification_status as string || "pending"}><option value="pending">Pending verification</option><option value="verified">Verified</option><option value="expired">Expired</option></select></label>
            <label>Notes <span className="optional">Optional</span><textarea name="notes" defaultValue={initial?.notes as string || ""} rows={2} maxLength={1000} /></label>
          </>}
          {kind === "job" && <>
            <label>Property<select name="property_id" defaultValue={initial?.property_id as string || ""} required><option value="" disabled>Select a property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.address_line_1}, {property.postcode}</option>)}</select>{properties.length === 0 && <span className="field-hint">Add a property before creating a request.</span>}</label>
            <label>Issue title<input name="title" defaultValue={initial?.title as string} required maxLength={140} placeholder="e.g. Leaking kitchen tap" /></label>
            <div className="field-row"><label>Required trade<select name="trade" defaultValue={initial?.trade as string || ""} required><option value="" disabled>Select a trade</option>{trades.map((trade) => <option key={trade}>{trade}</option>)}</select></label><label>Priority<select name="priority" defaultValue={initial?.priority as string || "normal"}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="emergency">Emergency</option></select></label></div>
            <label>Problem description<textarea name="description" defaultValue={initial?.description as string} required minLength={10} maxLength={4000} rows={4} placeholder="Describe the issue, when it started and any relevant details." /></label>
            <label>Target completion date <span className="optional">Optional</span><input type="date" name="due_date" defaultValue={initial?.due_date as string || ""} /></label>
            {editing && <p className="field-hint">To assign a contractor or update progress, open the job record.</p>}
          </>}
          {error && <p className="form-message error-message" role="alert">{error}</p>}
          <footer className="dialog-actions"><button className="button button-subtle" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : kind === "job" ? "Create request" : "Save record"}</button></footer>
        </form>
      </section>
    </div>
  );
}
