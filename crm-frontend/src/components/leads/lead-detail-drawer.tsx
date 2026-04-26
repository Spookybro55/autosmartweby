"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Mail,
  Phone,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  User,
  Building2,
  Loader2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PriorityBadge } from "@/components/leads/priority-badge";
import { StatusBadge } from "@/components/leads/status-badge";
import { ASSIGNEE_NAMES, ALLOWED_USERS, UNASSIGNED_LABEL } from "@/lib/config";

const OUTREACH_STAGES: Record<string, string> = {
  NOT_CONTACTED: "Neosloveno",
  DRAFT_READY: "Připraveno",
  CONTACTED: "Osloveno",
  RESPONDED: "Reagoval",
  WON: "Zájem",
  LOST: "Nezájem",
};

const NEXT_ACTIONS = [
  "Oslovit",
  "Zavolat",
  "Poslat e-mail",
  "Čekat na odpověď",
  "Follow-up",
  "Naplánovat schůzku",
];

// KROK 5: sentinel for the "Nepřiděleno" Select option (cannot use ""
// because Radix Select treats empty strings as placeholder reset).
const UNASSIGNED_VALUE = "__unassigned__";

interface Lead {
  id: string;
  rowNumber: number;
  businessName: string;
  ico: string;
  city: string;
  area: string;
  phone: string;
  email: string;
  websiteUrl: string;
  hasWebsite: boolean;
  contactName: string;
  segment: string;
  serviceType: string;
  painPoint: string;
  rating: number | null;
  reviewsCount: number | null;
  source: string;
  createdAt: string;
  contactReady: boolean;
  contactReason: string;
  contactPriority: "HIGH" | "MEDIUM" | "LOW";
  qualifiedForPreview: boolean;
  previewStage: string;
  previewUrl: string;
  previewScreenshotUrl: string;
  previewHeadline: string;
  emailSubjectDraft: string;
  emailBodyDraft: string;
  emailSyncStatus: string;
  emailReplyType: string;
  lastEmailSentAt: string;
  lastEmailReceivedAt: string;
  outreachStage: string;
  nextAction: string;
  lastContactAt: string;
  nextFollowupAt: string;
  salesNote: string;
  personalizationLevel: string;
  assigneeEmail: string;
}

interface LeadEditableFields {
  outreachStage: string;
  nextAction: string;
  lastContactAt: string;
  nextFollowupAt: string;
  salesNote: string;
  assigneeEmail: string;
}

interface LeadDetailDrawerProps {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return format(parseISO(dateStr), "yyyy-MM-dd");
  } catch {
    return "";
  }
}

function DetailRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            {value}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <p className="text-sm text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </h3>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-6 p-4 pt-0">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Separator />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function LeadDetailDrawer({
  leadId,
  open,
  onOpenChange,
  onSaved,
}: LeadDetailDrawerProps) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Phase 2 KROK 4: state machine for the "Vygenerovat preview" button.
  // idle → generating (button disabled, spinner) → success | error.
  const [previewState, setPreviewState] = useState<
    "idle" | "generating" | "success" | "error"
  >("idle");
  const [previewError, setPreviewError] = useState<string>("");
  // Phase 2 KROK 6: editable email draft + send state machine.
  // emailSubject/Body initialise from the lead drafts on fetch and
  // diverge only while the operator types — no auto-save, no AS write
  // until the operator clicks "Odeslat" (then sendEmailForLead_
  // persists the override into draft columns before the GmailApp call).
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [emailBody, setEmailBody] = useState<string>("");
  const [sendState, setSendState] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [sendError, setSendError] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [form, setForm] = useState<LeadEditableFields>({
    outreachStage: "",
    nextAction: "",
    lastContactAt: "",
    nextFollowupAt: "",
    salesNote: "",
    assigneeEmail: "",
  });

  const abortRef = useRef<AbortController | null>(null);

  const fetchLead = useCallback(async (id: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLead(null);

    try {
      const res = await fetch(`/api/leads/${id}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Nepodařilo se načíst detail leadu");
      const data: Lead = await res.json();
      setLead(data);
      setForm({
        outreachStage: data.outreachStage ?? "",
        nextAction: data.nextAction ?? "",
        lastContactAt: formatDateForInput(data.lastContactAt),
        nextFollowupAt: formatDateForInput(data.nextFollowupAt),
        salesNote: data.salesNote ?? "",
        assigneeEmail: (data.assigneeEmail ?? "").toLowerCase(),
      });
      // Phase 2 KROK 6: re-seed email editor from the latest drafts
      // every time the lead loads (covers initial fetch, regenerate,
      // post-send refresh).
      setEmailSubject(data.emailSubjectDraft ?? "");
      setEmailBody(data.emailBodyDraft ?? "");
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        toast.error("Chyba při načítání leadu");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && leadId) {
      fetchLead(leadId);
    }
    if (!open) {
      setLead(null);
    }
    // Reset preview button state whenever the drawer is closed or the
    // selected lead changes — prevents a stale "success" badge from
    // bleeding across leads.
    setPreviewState("idle");
    setPreviewError("");
    setSendState("idle");
    setSendError("");
    setConfirmOpen(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [open, leadId, fetchLead]);

  async function handleSave() {
    if (!leadId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Nepodařilo se uložit změny");
      toast.success("Změny uloženy");
      onSaved();
    } catch {
      toast.error("Chyba při ukládání");
    } finally {
      setSaving(false);
    }
  }

  // Phase 2 KROK 4: trigger Apps Script processPreviewForLead_ via the
  // /api/leads/[id]/generate-preview route. Maps known eligibility
  // errors to user-friendly Czech messages; on success refreshes the
  // lead so previewUrl + previewStage update without a manual reload.
  async function handleGenerate() {
    if (!leadId || previewState === "generating") return;
    setPreviewState("generating");
    setPreviewError("");
    try {
      const res = await fetch(`/api/leads/${leadId}/generate-preview`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const code = String(data.error ?? "");
        const msg =
          code === "not_qualified"
            ? "Lead není kvalifikovaný — preview nelze vygenerovat."
            : code === "dedupe_blocked"
              ? "Lead je označen jako duplikát — preview se negeneruje."
              : code.startsWith("lead_not_found")
                ? "Lead nebyl nalezen v Sheets."
                : code || "Generování selhalo.";
        setPreviewState("error");
        setPreviewError(msg);
        toast.error(msg);
        return;
      }
      setPreviewState("success");
      toast.success("Preview vygenerováno");
      // Refresh the lead so previewUrl / previewStage / previewHeadline
      // reflect the just-written values from Apps Script.
      await fetchLead(leadId);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chyba při generování";
      setPreviewState("error");
      setPreviewError(msg);
      toast.error("Chyba při generování preview");
    }
  }

  // Phase 2 KROK 6: send email via /api/leads/[id]/send-email which
  // delegates to OutboundEmail.gs:sendEmailForLead_. Subject/body
  // overrides are forwarded so the operator's edits land on the wire.
  async function handleSend() {
    if (!leadId || sendState === "sending") return;
    setSendState("sending");
    setSendError("");
    setConfirmOpen(false);
    try {
      const res = await fetch(`/api/leads/${leadId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectOverride: emailSubject,
          bodyOverride: emailBody,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        const code = String(data.error ?? "");
        const msg =
          code === "not_qualified"
            ? "Lead není kvalifikovaný."
            : code.startsWith("preview_not_ready")
              ? "Preview ještě není ve stavu READY_FOR_REVIEW. Vygenerujte ho nejdřív."
              : code === "empty_drafts"
                ? "Předmět nebo tělo emailu je prázdné."
                : code === "invalid_email"
                  ? "Lead nemá validní emailovou adresu."
                  : code.startsWith("lead_not_found")
                    ? "Lead nebyl nalezen v Sheets."
                    : code.startsWith("send_failed")
                      ? "Gmail odmítl odeslání: " + code.slice("send_failed: ".length)
                      : code || "Odeslání selhalo.";
        setSendState("error");
        setSendError(msg);
        toast.error(msg);
        return;
      }
      setSendState("success");
      toast.success("Email odeslán");
      // Refresh so lastEmailSentAt + outreachStage update in the drawer
      // header / status pill without a manual reload.
      await fetchLead(leadId);
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chyba při odesílání";
      setSendState("error");
      setSendError(msg);
      toast.error("Chyba při odesílání emailu");
    }
  }

  function updateForm(patch: Partial<LeadEditableFields>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[520px] p-0 flex flex-col"
        showCloseButton
      >
        {loading || !lead ? (
          <>
            <SheetHeader className="p-4 pb-0">
              <SheetTitle>
                <Skeleton className="h-6 w-48" />
              </SheetTitle>
              <SheetDescription>
                <Skeleton className="h-4 w-24" />
              </SheetDescription>
            </SheetHeader>
            <DrawerSkeleton />
          </>
        ) : (
          <>
            <SheetHeader className="p-4 pb-2">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="min-w-0">
                  <SheetTitle className="text-lg leading-tight">
                    {lead.businessName}
                  </SheetTitle>
                  <SheetDescription className="mt-1">
                    {lead.city}
                    {lead.area ? ` / ${lead.area}` : ""}
                  </SheetDescription>
                </div>
                <PriorityBadge priority={lead.contactPriority} />
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="px-4 pb-4 space-y-5">
                {/* Kontaktni udaje */}
                <section>
                  <SectionTitle>Kontaktní údaje</SectionTitle>
                  <div className="space-y-0.5">
                    <DetailRow
                      icon={<Phone className="size-3.5" />}
                      label="Telefon"
                      value={lead.phone}
                      href={lead.phone ? `tel:${lead.phone}` : undefined}
                    />
                    <DetailRow
                      icon={<Mail className="size-3.5" />}
                      label="E-mail"
                      value={lead.email}
                      href={lead.email ? `mailto:${lead.email}` : undefined}
                    />
                    <DetailRow
                      icon={<Globe className="size-3.5" />}
                      label="Web"
                      value={lead.websiteUrl}
                      href={lead.websiteUrl || undefined}
                    />
                    <DetailRow
                      icon={<User className="size-3.5" />}
                      label="Kontaktní osoba"
                      value={lead.contactName}
                    />
                    <DetailRow
                      icon={<Building2 className="size-3.5" />}
                      label="ICO"
                      value={lead.ico}
                    />
                  </div>
                </section>

                <Separator />

                {/* Shrnutí */}
                <section>
                  <SectionTitle>Shrnutí</SectionTitle>
                  <div className="space-y-2 text-sm">
                    {lead.painPoint && (
                      <div>
                        <span className="text-muted-foreground">Problém: </span>
                        <span className="text-foreground">{lead.painPoint}</span>
                      </div>
                    )}
                    {lead.serviceType && (
                      <div>
                        <span className="text-muted-foreground">Služba: </span>
                        <span className="text-foreground">{lead.serviceType}</span>
                      </div>
                    )}
                    {lead.segment && (
                      <div>
                        <span className="text-muted-foreground">Segment: </span>
                        <span className="text-foreground">{lead.segment}</span>
                      </div>
                    )}
                    {lead.contactReason && (
                      <div>
                        <span className="text-muted-foreground">Důvod kontaktu: </span>
                        <span className="text-foreground">{lead.contactReason}</span>
                      </div>
                    )}
                  </div>
                </section>

                <Separator />

                {/* Preview — Phase 2 KROK 4: always rendered (even when no
                    preview yet) so operator can trigger generation. */}
                <section>
                  <SectionTitle>Preview</SectionTitle>
                  {lead.previewHeadline && (
                    <p className="text-sm text-foreground mb-1.5">
                      {lead.previewHeadline}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {lead.previewUrl && (
                      <a
                        href={lead.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        Zobrazit preview
                        <ExternalLink className="size-3" />
                      </a>
                    )}

                    {lead.qualifiedForPreview ? (
                      <Button
                        type="button"
                        size="sm"
                        variant={lead.previewUrl ? "outline" : "default"}
                        onClick={handleGenerate}
                        disabled={previewState === "generating"}
                      >
                        {previewState === "generating" ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Generuji preview… (5–15 s)
                          </>
                        ) : lead.previewUrl ? (
                          <>
                            <RefreshCw className="size-4" />
                            Regenerovat
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4" />
                            Vygenerovat preview
                          </>
                        )}
                      </Button>
                    ) : (
                      <Tooltip>
                        {/* base-ui TooltipTrigger renders a <button> by
                            default; we override with `render={<span>}` so
                            the disabled button inside still triggers the
                            tooltip on hover (disabled buttons do not
                            dispatch pointer events themselves). */}
                        <TooltipTrigger render={<span tabIndex={0} />}>
                          <Button
                            type="button"
                            size="sm"
                            variant={lead.previewUrl ? "outline" : "default"}
                            disabled
                          >
                            {lead.previewUrl ? (
                              <>
                                <RefreshCw className="size-4" />
                                Regenerovat
                              </>
                            ) : (
                              <>
                                <Sparkles className="size-4" />
                                Vygenerovat preview
                              </>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Lead není kvalifikovaný.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {previewState === "success" && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 className="size-3.5" />
                      Preview vygenerováno.
                    </p>
                  )}
                  {previewState === "error" && previewError && (
                    <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                      {previewError}
                    </p>
                  )}
                </section>
                <Separator />

                {/* E-mail draft — Phase 2 KROK 6: editable + Odeslat */}
                {(() => {
                  const alreadySent = !!lead.lastEmailSentAt;
                  const senderName =
                    lead.assigneeEmail && ASSIGNEE_NAMES[lead.assigneeEmail]
                      ? ASSIGNEE_NAMES[lead.assigneeEmail]
                      : "Sebastián Fridrich";
                  const senderEmail =
                    lead.assigneeEmail && ASSIGNEE_NAMES[lead.assigneeEmail]
                      ? lead.assigneeEmail
                      : "sebastian@autosmartweb.cz";

                  // Disable reasons (most-specific first)
                  let disabledReason: string | null = null;
                  if (!lead.qualifiedForPreview) {
                    disabledReason = "Lead není kvalifikovaný.";
                  } else if (!lead.previewUrl || lead.previewStage !== "READY_FOR_REVIEW") {
                    disabledReason =
                      "Preview ještě není připravený (stav " +
                      (lead.previewStage || "—") +
                      "). Nejdřív vygenerujte preview.";
                  } else if (!emailSubject.trim() || !emailBody.trim()) {
                    disabledReason = "Předmět nebo tělo emailu je prázdné.";
                  } else if (!lead.email || !lead.email.includes("@")) {
                    disabledReason = "Lead nemá validní emailovou adresu.";
                  }
                  const sendDisabled =
                    !!disabledReason || sendState === "sending";

                  const buttonLabel =
                    sendState === "sending"
                      ? "Odesílám…"
                      : alreadySent
                        ? "Odeslat znovu"
                        : "Odeslat";

                  return (
                    <section>
                      <SectionTitle>E-mail</SectionTitle>

                      {alreadySent && (
                        <p className="mb-3 inline-flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                          <span>
                            Email byl již odeslán{" "}
                            {(() => {
                              try {
                                return format(
                                  parseISO(lead.lastEmailSentAt),
                                  "d. MMMM yyyy 'v' HH:mm",
                                  { locale: cs },
                                );
                              } catch {
                                return lead.lastEmailSentAt;
                              }
                            })()}
                            . Opětovné odeslání pošle email znovu.
                          </span>
                        </p>
                      )}

                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="drawer-email-subject">Předmět</Label>
                          <Input
                            id="drawer-email-subject"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            disabled={sendState === "sending"}
                            placeholder="Předmět emailu"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="drawer-email-body">Tělo e-mailu</Label>
                          <Textarea
                            id="drawer-email-body"
                            value={emailBody}
                            onChange={(e) => setEmailBody(e.target.value)}
                            disabled={sendState === "sending"}
                            className="min-h-32 text-sm font-mono"
                            placeholder="Tělo emailu"
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {sendDisabled && disabledReason ? (
                          <Tooltip>
                            <TooltipTrigger render={<span tabIndex={0} />}>
                              <Button type="button" disabled>
                                {sendState === "sending" ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Send className="size-4" />
                                )}
                                {buttonLabel}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{disabledReason}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => setConfirmOpen(true)}
                            disabled={sendDisabled}
                          >
                            {sendState === "sending" ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                            {buttonLabel}
                          </Button>
                        )}
                      </div>

                      {sendState === "success" && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-600">
                          <CheckCircle2 className="size-3.5" />
                          Email odeslán.
                        </p>
                      )}
                      {sendState === "error" && sendError && (
                        <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-destructive">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                          {sendError}
                        </p>
                      )}

                      {/* Confirm dialog */}
                      <Dialog
                        open={confirmOpen}
                        onOpenChange={(o) => setConfirmOpen(o)}
                      >
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Odeslat email</DialogTitle>
                            <DialogDescription>
                              Email půjde rovnou klientovi. Po odeslání se aktualizuje
                              stav leadu na <strong>CONTACTED</strong>.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3 py-2 text-sm">
                            <div>
                              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                Příjemce
                              </p>
                              <p className="font-medium">
                                {lead.businessName} &lt;{lead.email}&gt;
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                Reply-To
                              </p>
                              <p className="font-medium">
                                {senderName} &lt;{senderEmail}&gt;
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                Předmět
                              </p>
                              <p className="font-medium break-words">
                                {emailSubject}
                              </p>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setConfirmOpen(false)}
                            >
                              Zrušit
                            </Button>
                            <Button type="button" onClick={handleSend}>
                              <Send className="size-4" />
                              {alreadySent ? "Odeslat znovu" : "Odeslat"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </section>
                  );
                })()}
                <Separator />

                {/* Editovatelna pole */}
                <section>
                  <SectionTitle>Editovatelná pole</SectionTitle>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="drawer-stage">Stav</Label>
                      <Select
                        value={form.outreachStage}
                        onValueChange={(val) =>
                          val != null && updateForm({ outreachStage: val })
                        }
                      >
                        <SelectTrigger id="drawer-stage" className="w-full">
                          <SelectValue placeholder="Zvolte stav" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(OUTREACH_STAGES).map(
                            ([key, label]) => (
                              <SelectItem key={key} value={key}>
                                {label}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="drawer-assignee">Přiděleno</Label>
                      <Select
                        value={
                          form.assigneeEmail === ""
                            ? UNASSIGNED_VALUE
                            : ALLOWED_USERS.includes(form.assigneeEmail)
                              ? form.assigneeEmail
                              : form.assigneeEmail /* unknown legacy email — render raw */
                        }
                        onValueChange={(val) => {
                          if (val == null) return;
                          updateForm({
                            assigneeEmail: val === UNASSIGNED_VALUE ? "" : val,
                          });
                        }}
                      >
                        <SelectTrigger id="drawer-assignee" className="w-full">
                          <SelectValue placeholder="Zvolte přidělení" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED_VALUE}>
                            {UNASSIGNED_LABEL}
                          </SelectItem>
                          {ALLOWED_USERS.map((email) => (
                            <SelectItem key={email} value={email}>
                              {ASSIGNEE_NAMES[email]}{" "}
                              <span className="text-xs text-muted-foreground">
                                ({email})
                              </span>
                            </SelectItem>
                          ))}
                          {/* Surface orphaned legacy assignee so operator can re-pick */}
                          {form.assigneeEmail !== "" &&
                            !ALLOWED_USERS.includes(form.assigneeEmail) && (
                              <SelectItem value={form.assigneeEmail}>
                                Neznámý: {form.assigneeEmail}
                              </SelectItem>
                            )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="drawer-action">Další krok</Label>
                      <Select
                        value={form.nextAction}
                        onValueChange={(val) =>
                          val != null && updateForm({ nextAction: val })
                        }
                      >
                        <SelectTrigger id="drawer-action" className="w-full">
                          <SelectValue placeholder="Zvolte akci" />
                        </SelectTrigger>
                        <SelectContent>
                          {NEXT_ACTIONS.map((action) => (
                            <SelectItem key={action} value={action}>
                              {action}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="drawer-last-contact">
                          Poslední kontakt
                        </Label>
                        <Input
                          id="drawer-last-contact"
                          type="date"
                          value={form.lastContactAt}
                          onChange={(e) =>
                            updateForm({ lastContactAt: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="drawer-followup">Follow-up</Label>
                        <Input
                          id="drawer-followup"
                          type="date"
                          value={form.nextFollowupAt}
                          onChange={(e) =>
                            updateForm({ nextFollowupAt: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="drawer-note">Poznámka</Label>
                      <Textarea
                        id="drawer-note"
                        value={form.salesNote}
                        onChange={(e) =>
                          updateForm({ salesNote: e.target.value })
                        }
                        placeholder="Poznámka k leadu..."
                        className="min-h-20"
                      />
                    </div>

                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="size-4 mr-1.5 animate-spin" />
                          Ukládám...
                        </>
                      ) : (
                        <>
                          <Save className="size-4 mr-1.5" />
                          Uložit změny
                        </>
                      )}
                    </Button>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
