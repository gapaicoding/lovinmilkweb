import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { OperationalInputterCard } from "@/components/OperationalInputterCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBusinessStructure } from "@/hooks/useBusinessStructure";
import { useOperationalInputter } from "@/hooks/useOperationalInputter";
import { jakartaToday } from "@/lib/businessPeriod";
import {
  calendarDates,
  fetchMarketingRecaps,
  googleRating,
  indonesianMarketingDay,
  saveMarketingRecap,
  summarizeMarketing,
  type MarketingDraft,
  type MarketingEvent,
  type MarketingMember,
  type MarketingRecap,
} from "@/lib/marketingDevelopment";
import { exportMarketingWorkbook } from "@/lib/marketingDevelopmentWorkbook";

const emptyDraft = (): MarketingDraft => ({
  registeredMembershipTotal: null,
  promoClaimCount: 0,
  stars: [0, 0, 0, 0, 0],
  customerEngagementCount: 0,
  members: [],
  events: [],
});
export function MarketingDevelopmentManager() {
  const { outlet, isLoading, error } = useBusinessStructure(),
    outletId = outlet?.id ?? null,
    inputter = useOperationalInputter(outletId, "marketing"),
    client = useQueryClient();
  const [month, setMonth] = useState(jakartaToday().slice(0, 7)),
    [editing, setEditing] = useState<{ date: string; recap: MarketingRecap | null } | null>(null),
    [detail, setDetail] = useState<{ kind: "members" | "events"; recap: MarketingRecap } | null>(
      null,
    ),
    [exporting, setExporting] = useState(false);
  const query = useQuery({
      queryKey: ["marketing-daily-recaps", outletId, month],
      enabled: Boolean(outletId),
      queryFn: () => fetchMarketingRecaps(outletId!, month),
    }),
    rows = query.data ?? [],
    byDate = new Map(rows.map((r) => [r.business_date, r])),
    summary = summarizeMarketing(rows);
  if (isLoading) return <State text="Memuat Marketing & Development..." />;
  if (error || !outletId) return <State text="Data Outlet gagal dimuat." />;
  const doExport = async () => {
    setExporting(true);
    try {
      await exportMarketingWorkbook(rows, month);
      toast.success("Export Excel selesai.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export Excel gagal.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketing &amp; Development</h1>
        <p className="text-muted-foreground">Rekap Marketing &amp; Development harian.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Periode">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Button variant="outline" disabled={exporting || query.isLoading} onClick={doExport}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Excel
          </Button>
          <span className="pb-2 text-sm">
            Data Terinput: <b>{summary.savedDates}</b>
          </span>
        </div>
        <OperationalInputterCard outletId={outletId} section="marketing" />
      </div>
      {!inputter.name ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Atur nama penginput terlebih dahulu.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        <Metric label="Membership Baru" value={summary.members} />
        <Metric label="Klaim Promo" value={summary.promo} />
        <Metric label="Review Google" value={summary.rating.total} />
        <Metric
          label="Average Rating"
          value={summary.rating.average === null ? "—" : summary.rating.average.toFixed(2)}
        />
        <Metric label="Customer Engagement" value={summary.engagement} />
        <Metric label="Event" value={summary.eventCount} />
        <Metric label="Total Peserta" value={summary.participants} />
      </div>
      {query.isLoading ? (
        <State text="Memuat rekap bulanan..." />
      ) : query.isError ? (
        <State text="Rekap Marketing gagal dimuat." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1750px]">
            <TableHeader>
              <TableRow>
                {[
                  "Hari",
                  "Tanggal",
                  "Pendaftaran Membership Baru",
                  "Jumlah Membership Terdaftar",
                  "Klaim Promo",
                  "★1",
                  "★2",
                  "★3",
                  "★4",
                  "★5",
                  "Total Rating",
                  "Wawancara / Ajak Bermain",
                  "Event",
                  "Tipe Registrasi",
                  "Pihak Ketiga",
                  "Peserta di luar Pemilik",
                  "Action",
                ].map((x) => (
                  <TableHead key={x} className="whitespace-normal text-center">
                    {x}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendarDates(month).map((date) => {
                const r = byDate.get(date),
                  members = r?.marketing_daily_membership_entries ?? [],
                  events = r?.marketing_daily_events ?? [],
                  rating = googleRating(
                    r
                      ? [
                          r.google_star_1_count,
                          r.google_star_2_count,
                          r.google_star_3_count,
                          r.google_star_4_count,
                          r.google_star_5_count,
                        ]
                      : [0, 0, 0, 0, 0],
                  ),
                  single = events.length === 1 ? events[0] : null;
                return (
                  <TableRow
                    key={date}
                    className={
                      indonesianMarketingDay(date) === "Minggu" ? "bg-red-50/50" : undefined
                    }
                  >
                    <TableCell>{indonesianMarketingDay(date)}</TableCell>
                    <TableCell>{formatDate(date)}</TableCell>
                    <TableCell className="text-center">
                      {members.length ? (
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => setDetail({ kind: "members", recap: r! })}
                        >
                          {members.length}
                        </Button>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r?.registered_membership_total ?? "—"}
                    </TableCell>
                    <N v={r?.promo_claim_count ?? 0} />
                    <N v={r?.google_star_1_count ?? 0} />
                    <N v={r?.google_star_2_count ?? 0} />
                    <N v={r?.google_star_3_count ?? 0} />
                    <N v={r?.google_star_4_count ?? 0} />
                    <N v={r?.google_star_5_count ?? 0} />
                    <N v={rating.total} />
                    <N v={r?.customer_engagement_count ?? 0} />
                    <TableCell className="text-center">
                      {events.length ? (
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => setDetail({ kind: "events", recap: r! })}
                        >
                          {events.length} Event
                        </Button>
                      ) : (
                        "0 Event"
                      )}
                    </TableCell>
                    <TableCell>
                      {single?.registration_type ?? (events.length > 1 ? "Lihat detail" : "—")}
                    </TableCell>
                    <TableCell>{single?.third_party ?? "—"}</TableCell>
                    <N v={events.reduce((n, e) => n + e.external_participant_count, 0)} />
                    <TableCell>
                      <Button
                        size="sm"
                        variant={r ? "outline" : "default"}
                        disabled={!inputter.name}
                        onClick={() => setEditing({ date, recap: r ?? null })}
                      >
                        {r ? "Edit" : "Isi Data"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {editing ? (
        <EditDialog
          date={editing.date}
          recap={editing.recap}
          inputterName={editing.recap?.inputter_name ?? inputter.name ?? ""}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const session = await inputter.ensureValidSession();
            await saveMarketingRecap(outletId, editing.date, session.sessionId, draft);
            await client.invalidateQueries({ queryKey: ["marketing-daily-recaps", outletId] });
          }}
        />
      ) : null}
      {detail ? <DetailDialog {...detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold">{value}</CardContent>
    </Card>
  );
}
function N({ v }: { v: number }) {
  return <TableCell className="text-center">{v}</TableCell>;
}
function State({ text }: { text: string }) {
  return (
    <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">{text}</div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function formatDate(v: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${v}T00:00:00Z`));
}
function numberValue(v: string) {
  return v === "" ? 0 : Number(v);
}

function EditDialog({
  date,
  recap,
  inputterName,
  onClose,
  onSave,
}: {
  date: string;
  recap: MarketingRecap | null;
  inputterName: string;
  onClose: () => void;
  onSave: (d: MarketingDraft) => Promise<void>;
}) {
  const initial: MarketingDraft = recap
    ? {
        registeredMembershipTotal: recap.registered_membership_total,
        promoClaimCount: recap.promo_claim_count,
        stars: [
          recap.google_star_1_count,
          recap.google_star_2_count,
          recap.google_star_3_count,
          recap.google_star_4_count,
          recap.google_star_5_count,
        ],
        customerEngagementCount: recap.customer_engagement_count,
        members: recap.marketing_daily_membership_entries.map((m) => ({ ...m })),
        events: recap.marketing_daily_events.map((e) => ({ ...e })),
      }
    : emptyDraft();
  const [draft, setDraft] = useState(initial),
    [saving, setSaving] = useState(false),
    rating = googleRating(draft.stars);
  const setCount = (key: "promoClaimCount" | "customerEngagementCount", v: string) =>
    setDraft((d) => ({ ...d, [key]: numberValue(v) }));
  const save = async () => {
    if (draft.members.some((m) => !m.member_name.trim() || !m.phone_number.trim()))
      return toast.error("Nama Member dan Nomor HP wajib diisi.");
    if (draft.events.some((e) => !e.event_name.trim() || !e.registration_type))
      return toast.error("Nama Event dan Tipe Registrasi wajib diisi.");
    setSaving(true);
    try {
      await onSave(draft);
      toast.success("Rekap Marketing tersimpan.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rekap Marketing gagal disimpan.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {recap ? "Edit" : "Isi Data"} Marketing — {formatDate(date)}
          </DialogTitle>
        </DialogHeader>
        <section className="grid gap-4 sm:grid-cols-3">
          <Field label="Hari">
            <Input readOnly value={indonesianMarketingDay(date)} />
          </Field>
          <Field label="Tanggal">
            <Input readOnly value={date} />
          </Field>
          <Field label="Nama Penginput">
            <Input readOnly value={inputterName} />
          </Field>
        </section>
        <Section title={`Membership — ${draft.members.length} baru`}>
          <div className="space-y-3">
            {draft.members.map((m, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="Nama Member">
                  <Input
                    maxLength={150}
                    value={m.member_name}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        members: d.members.map((x, j) =>
                          j === i ? { ...x, member_name: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </Field>
                <Field label="Nomor HP">
                  <Input
                    maxLength={40}
                    inputMode="tel"
                    value={m.phone_number}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        members: d.members.map((x, j) =>
                          j === i ? { ...x, phone_number: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                </Field>
                <Button
                  className="self-end"
                  size="icon"
                  variant="ghost"
                  aria-label="Hapus member"
                  onClick={() =>
                    setDraft((d) => ({ ...d, members: d.members.filter((_, j) => j !== i) }))
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  members: [...d.members, { member_name: "", phone_number: "" }],
                }))
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Tambah Member
            </Button>
            <Field label="Jumlah Membership Terdaftar">
              <Input
                type="number"
                min="0"
                step="1"
                value={draft.registeredMembershipTotal ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    registeredMembershipTotal:
                      e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
            </Field>
          </div>
        </Section>
        <Section title="Promo">
          <Field label="Klaim Promo">
            <CountInput
              value={draft.promoClaimCount}
              onChange={(v) => setCount("promoClaimCount", v)}
            />
          </Field>
        </Section>
        <Section title="Google Business">
          <div className="grid gap-3 sm:grid-cols-5">
            {draft.stars.map((v, i) => (
              <Field key={i} label={`Bintang ${i + 1}`}>
                <CountInput
                  value={v}
                  onChange={(x) =>
                    setDraft((d) => ({
                      ...d,
                      stars: d.stars.map((n, j) =>
                        j === i ? numberValue(x) : n,
                      ) as MarketingDraft["stars"],
                    }))
                  }
                />
              </Field>
            ))}
          </div>
          <p className="text-sm">
            Total Review: <b>{rating.total}</b> · Average Rating:{" "}
            <b>{rating.average === null ? "—" : rating.average.toFixed(2)}</b>
          </p>
        </Section>
        <Section title="Customer Engagement">
          <Field label="Wawancara dan/atau Ajak Bermain Anak Customer">
            <CountInput
              value={draft.customerEngagementCount}
              onChange={(v) => setCount("customerEngagementCount", v)}
            />
          </Field>
        </Section>
        <Section title={`Event Marketing — ${draft.events.length} event`}>
          <div className="space-y-3">
            {draft.events.map((e, i) => (
              <EventFields
                key={i}
                value={e}
                onChange={(value) =>
                  setDraft((d) => ({ ...d, events: d.events.map((x, j) => (j === i ? value : x)) }))
                }
                onRemove={() =>
                  setDraft((d) => ({ ...d, events: d.events.filter((_, j) => j !== i) }))
                }
              />
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                events: [
                  ...d.events,
                  {
                    event_name: "",
                    registration_type: "UNPAID",
                    third_party: null,
                    external_participant_count: 0,
                  },
                ],
              }))
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Event
          </Button>
        </Section>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Batal
          </Button>
          <Button disabled={saving} onClick={save}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}
function CountInput({ value, onChange }: { value: number; onChange: (v: string) => void }) {
  return (
    <Input
      type="number"
      min="0"
      step="1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function EventFields({
  value,
  onChange,
  onRemove,
}: {
  value: MarketingEvent;
  onChange: (v: MarketingEvent) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
      <Field label="Nama Kegiatan Event">
        <Input
          maxLength={200}
          value={value.event_name}
          onChange={(e) => onChange({ ...value, event_name: e.target.value })}
        />
      </Field>
      <Field label="Tipe Registrasi">
        <select
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          value={value.registration_type}
          onChange={(e) =>
            onChange({
              ...value,
              registration_type: e.target.value as MarketingEvent["registration_type"],
            })
          }
        >
          <option value="PAID">PAID</option>
          <option value="UNPAID">UNPAID</option>
        </select>
      </Field>
      <Field label="Pihak Ketiga">
        <Input
          maxLength={200}
          value={value.third_party ?? ""}
          onChange={(e) => onChange({ ...value, third_party: e.target.value || null })}
        />
      </Field>
      <Field label="Peserta di luar Pemilik">
        <CountInput
          value={value.external_participant_count}
          onChange={(v) => onChange({ ...value, external_participant_count: numberValue(v) })}
        />
      </Field>
      <Button className="sm:col-span-2" variant="ghost" onClick={onRemove}>
        <Trash2 className="mr-2 h-4 w-4" />
        Hapus Event
      </Button>
    </div>
  );
}
function DetailDialog({
  kind,
  recap,
  onClose,
}: {
  kind: "members" | "events";
  recap: MarketingRecap;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {kind === "members" ? "Membership Baru" : "Event Marketing"} —{" "}
            {formatDate(recap.business_date)}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-3 overflow-auto">
          {kind === "members"
            ? recap.marketing_daily_membership_entries.map((m, i) => (
                <div key={m.id ?? i} className="rounded-md border p-3">
                  <b>
                    {i + 1}. {m.member_name}
                  </b>
                  <p className="text-sm text-muted-foreground">{m.phone_number}</p>
                </div>
              ))
            : recap.marketing_daily_events.map((e, i) => (
                <div key={e.id ?? i} className="rounded-md border p-3">
                  <b>
                    {i + 1}. {e.event_name}
                  </b>
                  <p className="text-sm">
                    {e.registration_type} · Pihak Ketiga: {e.third_party ?? "—"} · Peserta:{" "}
                    {e.external_participant_count}
                  </p>
                </div>
              ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
