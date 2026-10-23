'use strict';
/* Recommendations: action lists + Pipeline intelligence + work queue.
   Loaded before dashboard.js; uses its helpers ($, esc, t, icon, api, ALL,
   state, match, openLead...) only at call time.

   - Every open deal lands in exactly one action list (rule-based, instant).
   - Pipeline intelligence (server, lib/pipeline) reads each qualified lead's
     real conversation in ActiveCampaign and diagnoses where it's stuck; the
     lists use it (e.g. "Waiting on us") and each lead shows its next step.
   - Each lead can be worked from here: scripts, note, move stage, reassign,
     snooze, done, lost — the deal-changing ones are written to ActiveCampaign. */

// ───────────────────────── strings ─────────────────────────
(function addPipelineStrings() {
  const en = {
    in_sales: 'Sales', in_marketing: 'Marketing',
    pi_scope: 'Follows the filters above: {n} leads.',
    pi_wonOpen: 'In a Won stage, still open', pi_wonOpenSub: 'mark them Won in ActiveCampaign so they count',
    pi_whyOpen: 'Open leads that raised it', pi_whyWon: 'Enrolled who raised it anyway',
    sc_title: 'Lead score → real enrollment', sc_sub: 'Enrolled = matched to the Enrollments section (USA attribution sheet, Spain/LATAM won deals) by deal or email, not ActiveCampaign\'s Won stage.',
    sc_line: '{s}: {e} of {n} enrolled ({r})',
    sc_score: 'Score', sc_leads: 'Leads', sc_enrolled: 'Enrolled', sc_rate: 'Enrolled %', sc_decided: '% of decided', sc_decidedHint: 'enrolled ÷ (enrolled + lost): leaves out leads still open, so recent leads don\'t drag it down',
    sc_open: 'Still open', sc_lost: 'Lost', sc_notWon: 'Not marked Won in AC', sc_days: 'Median days to enroll',
    sc_cohorts: 'By month the lead came in (enrolled / leads)',
    sc_journeys: 'Score journeys', sc_tracking: 'Score changes tracked since {d} ({n} leads followed). ActiveCampaign doesn\'t keep score history, so paths fill in as reps update scores from that day on.',
    sc_noChanges: 'No score changes seen yet.', sc_paths: 'Paths that ended in an enrollment', sc_transitions: 'Every score change seen', sc_afterChange: 'median {d} days from the last change to enrolling', sc_ofWhich: '{e} enrolled',
    sc_offPath: 'Enrolled without a Good / Very Good score', sc_offPathNone: 'None: every enrolled lead had a Good or Very Good score.',
    sc_hygiene: 'Fix in ActiveCampaign', sc_hyg1: '{n} enrolled students are not marked Won in AC', sc_hyg2: '{n} deals sit in a Won stage but are still open', sc_hyg3: '{n} deals marked Won in AC match no enrollment (check the email or the sheet)',
    sc_loadingEnr: 'Enrollments are still loading: enrolled counts may be low for a minute.',
    sb_Very_Good: 'Very Good', sb_Good: 'Good', sb_No_Feedback: 'No Feedback', sb_Bad: 'Bad', sb_Junk: 'Junk (invalid, fake, duplicate)', sb_Not_scored: 'Not scored',
    g_waitingOnUs: 'Waiting on us',
    why_waitingOnUs: 'The lead replied, asked something or was promised something — and nothing came back from us (read from the AC notes).',
    do_waitingOnUs: 'Reply today, using what they asked. These are the cheapest enrollments you have.',
    why_readyToClose: 'Offer sent, F4/F5 stage, or payment terms already written in the deal.',
    g_qualifiedNoOffer: 'Qualified, not progressing',
    why_qualifiedNoOffer: 'Good / Very Good score, older than 7 days, still before the offer.',
    pi_title: 'Pipeline intelligence', pi_sub: 'Read from the real conversations in ActiveCampaign (deal notes, contact notes, stage changes), not just CRM fields',
    pi_scoreTruth: 'Score → enrolled', pi_scoreTruthSub: 'Very Good {vg} · Good {g}', pi_vgWin: '{w} of {n} Very Good enrolled',
    pi_waiting: 'Waiting on us', pi_waitingSub: 'qualified open leads where we owe the next move',
    pi_quiet: 'Quiet 8+ days', pi_quietSub: 'open qualified leads with no touch in 8+ days',
    pi_noNotes: 'No notes at all', pi_noNotesSub: 'open qualified leads where nobody wrote anything',
    pi_read: 'Conversations read', pi_readSub: '{d} diagnosed by AI · {q} in the AI queue',
    pi_where: 'Where qualified open leads sit', pi_why: 'Why they stop (open) vs objections overcome (won)', pi_open: 'Open', pi_won: 'Won',
    pi_compare: 'Enrolled vs still open (medians)', pi_firstTouch: 'Hours to first touch', pi_touches: 'Touches', pi_notes: 'Notes written', pi_silence: 'Days since last touch', pi_inStage: 'Days in current stage',
    pi_reps: 'By rep', pi_rep: 'Rep', pi_openQ: 'Open qualified', pi_waitingCol: 'Waiting on us', pi_quietCol: 'Quiet 7d+',
    pi_firstRead: 'The first full read of the pipeline runs in the background (a few hours, at a pace that leaves ActiveCampaign capacity for your automations). Numbers fill in as it goes.',
    pi_noAiYet: 'Not diagnosed yet', pi_notRead: 'Conversation not read yet', pi_readNow: 'Read now',
    pi_leadTitle: 'Conversation & next step', pi_reading: 'Reading the conversation in ActiveCampaign…', pi_rereading: 'Re-reading…',
    pi_ball_rep: 'Waiting on us', pi_ball_lead: 'Waiting on lead', pi_ball_none: 'Nothing pending',
    pi_lastTouch: 'last touch {d}d ago', pi_by: 'by {n}', pi_touchesN: '{n} touches', pi_never: 'no touches recorded',
    pi_next: 'Next', pi_when_today: 'today', pi_when_this_week: 'this week', pi_when_next_week: 'next week', pi_when_later: 'later',
    pi_nt_call: 'Call', pi_nt_sms: 'Text', pi_nt_email: 'Email', pi_nt_whatsapp: 'WhatsApp', pi_nt_send_offer: 'Send the offer', pi_nt_send_financing: 'Send financing options', pi_nt_book_call: 'Book the enrollment call', pi_nt_close_lost: 'Close as lost', pi_nt_wait: 'Wait',
    pi_stuck: 'Stuck at', pi_objections: 'Objections', pi_lastSignal: 'Last signal from the lead', pi_evidence: 'From the notes', pi_gaps: 'Missing in the CRM', pi_intent: 'Intent',
    pi_timeline: 'Timeline', pi_noTimeline: 'Nothing recorded in ActiveCampaign for this deal: no notes, no stage changes.', pi_reread: 'Re-read now',
    pi_readAt: 'Read {a} · diagnosed {b}',
    obj_price: 'Price', obj_financing: 'Financing', obj_timing: 'Timing', obj_schedule: 'Schedule', obj_job: 'Job', obj_family: 'Family / partner', obj_outcomes_doubt: 'Doubts about outcomes', obj_program_fit: 'Program fit', obj_competitor: 'Competitor', obj_ghosting: 'Ghosting', obj_not_interested: 'Not interested', obj_other: 'Other',
    st_not_reached: 'Not reached', st_first_contact: 'First contact', st_qualification: 'Qualification', st_offer: 'Offer', st_financing: 'Financing', st_decision: 'Decision', st_paperwork: 'Paperwork', st_enrolled: 'Enrolled', st_lost: 'Lost',
    sg_not_reached: 'Not reached', sg_f1: 'F1 low interest', sg_f2: 'F2 some feedback', sg_f3: 'F3 strong', sg_f4: 'F4 likely', sg_f5: 'F5 reg sent', sg_stalled: 'Stalled', sg_other: 'Other stage', sg_junk: 'Junk', sg_won: 'Won',
    a_script: 'Script', a_note: 'Note', a_stage: 'Move', a_owner: 'Reassign', a_snooze: 'Snooze', a_done: 'Done', a_lost: 'Lost', a_ac: 'AC',
    a_sms: 'Text', a_email: 'Email', a_call: 'Call opener', a_copy: 'Copy', a_copied: 'Copied', a_noScripts: 'No scripts yet — read the conversation first.', a_generate: 'Read & write scripts',
    a_notePh: 'What happened? (saved as a deal note in ActiveCampaign)', a_saveNote: 'Save to ActiveCampaign', a_alsoDone: 'Also mark done',
    a_snooze1: 'Tomorrow', a_snooze3: '3 days', a_snooze7: '1 week', a_snooze14: '2 weeks',
    a_lostReason: 'Lost reason', a_lostNote: 'Optional note', a_markLost: 'Mark lost in ActiveCampaign',
    a_doneToast: 'Done — hidden for 2 days', a_undo: 'Undo', a_saved: 'Saved to ActiveCampaign', a_moved: 'Moved to {s}', a_reassigned: 'Reassigned to {n}', a_snoozed: 'Snoozed', a_lostToast: 'Marked lost: {r}',
    a_failed: 'ActiveCampaign said no: {e}',
    q_hidden: '{n} snoozed / done', q_showHidden: 'show', q_hideHidden: 'hide', q_showMore: 'Show {n} more', q_selectAll: 'Select all shown',
    q_selected: '{n} selected', q_clear: 'Clear', q_bulkRunning: 'Working… {d}/{n}', q_bulkDone: 'Done: {d} updated, {f} failed', q_hiddenUntil: 'hidden until {d}', q_unhide: 'Show again',
    adv_basis: 'Based on {n} leads · {r} conversations read · {d} diagnosed', adv_prev: 'Previous advice: {d}', adv_ask: 'Ask a follow-up about this list…', adv_send: 'Ask',
    adv_none: 'No previous advice for this list — this is the baseline. Next time it will say what changed.',
  };
  const es = {
    in_sales: 'Ventas', in_marketing: 'Marketing',
    pi_scope: 'Sigue los filtros de arriba: {n} leads.',
    pi_wonOpen: 'En etapa Won, aún abiertos', pi_wonOpenSub: 'márcalos como ganados en ActiveCampaign para que cuenten',
    pi_whyOpen: 'Abiertos que lo plantearon', pi_whyWon: 'Matriculados que lo plantearon igual',
    sc_title: 'Score del lead → matrícula real', sc_sub: 'Matriculado = cruzado con la sección Matrículas (hoja de atribución USA, deals ganados España/LATAM) por deal o email, no la etapa Won de ActiveCampaign.',
    sc_line: '{s}: {e} de {n} matriculados ({r})',
    sc_score: 'Score', sc_leads: 'Leads', sc_enrolled: 'Matriculados', sc_rate: '% matriculados', sc_decided: '% de decididos', sc_decidedHint: 'matriculados ÷ (matriculados + perdidos): deja fuera los abiertos, así los leads recientes no bajan la tasa',
    sc_open: 'Aún abiertos', sc_lost: 'Perdidos', sc_notWon: 'Sin marcar Won en AC', sc_days: 'Mediana de días a matricularse',
    sc_cohorts: 'Por mes en que entró el lead (matriculados / leads)',
    sc_journeys: 'Recorridos de score', sc_tracking: 'Cambios de score registrados desde el {d} ({n} leads seguidos). ActiveCampaign no guarda el historial del score, así que los recorridos se completan a medida que los asesores lo actualizan desde ese día.',
    sc_noChanges: 'Aún no se ve ningún cambio de score.', sc_paths: 'Recorridos que terminaron en matrícula', sc_transitions: 'Todos los cambios de score', sc_afterChange: 'mediana de {d} días desde el último cambio hasta matricularse', sc_ofWhich: '{e} matriculados',
    sc_offPath: 'Matriculados sin score Good / Very Good', sc_offPathNone: 'Ninguno: todos los matriculados tenían score Good o Very Good.',
    sc_hygiene: 'Arreglar en ActiveCampaign', sc_hyg1: '{n} matriculados no están marcados Won en AC', sc_hyg2: '{n} deals están en una etapa Won pero siguen abiertos', sc_hyg3: '{n} deals Won en AC no cruzan con ninguna matrícula (revisa el email o la hoja)',
    sc_loadingEnr: 'Las matrículas aún se están cargando: los matriculados pueden salir bajos durante un minuto.',
    sb_Very_Good: 'Very Good', sb_Good: 'Good', sb_No_Feedback: 'Sin feedback', sb_Bad: 'Bad', sb_Junk: 'Basura (inválido, falso, duplicado)', sb_Not_scored: 'Sin score',
    g_waitingOnUs: 'Esperando por nosotros',
    why_waitingOnUs: 'El lead respondió, preguntó algo o se le prometió algo — y no le volvimos a escribir (leído de las notas de AC).',
    do_waitingOnUs: 'Responder hoy con lo que pidió. Son las matrículas más baratas que tienes.',
    why_readyToClose: 'Oferta enviada, etapa F4/F5 o condiciones de pago ya escritas en el deal.',
    g_qualifiedNoOffer: 'Calificados que no avanzan',
    why_qualifiedNoOffer: 'Score Good / Very Good, más de 7 días, todavía antes de la oferta.',
    pi_title: 'Inteligencia del pipeline', pi_sub: 'Leído de las conversaciones reales en ActiveCampaign (notas del deal, notas del contacto, cambios de etapa), no solo de campos del CRM',
    pi_scoreTruth: 'Score → matriculados', pi_scoreTruthSub: 'Very Good {vg} · Good {g}', pi_vgWin: '{w} de {n} Very Good se matricularon',
    pi_waiting: 'Esperando por nosotros', pi_waitingSub: 'leads calificados abiertos donde nos toca el siguiente paso',
    pi_quiet: 'Sin contacto 8+ días', pi_quietSub: 'calificados abiertos sin ningún toque en 8+ días',
    pi_noNotes: 'Sin ninguna nota', pi_noNotesSub: 'calificados abiertos donde nadie escribió nada',
    pi_read: 'Conversaciones leídas', pi_readSub: '{d} diagnosticadas por IA · {q} en cola',
    pi_where: 'Dónde están los calificados abiertos', pi_why: 'Por qué se frenan (abiertos) vs objeciones superadas (ganados)', pi_open: 'Abiertos', pi_won: 'Ganados',
    pi_compare: 'Matriculados vs abiertos (medianas)', pi_firstTouch: 'Horas al primer contacto', pi_touches: 'Toques', pi_notes: 'Notas escritas', pi_silence: 'Días desde el último toque', pi_inStage: 'Días en la etapa actual',
    pi_reps: 'Por asesor', pi_rep: 'Asesor', pi_openQ: 'Calificados abiertos', pi_waitingCol: 'Esperando por nosotros', pi_quietCol: 'Sin toque 7d+',
    pi_firstRead: 'La primera lectura completa del pipeline corre en segundo plano (unas horas, a un ritmo que deja capacidad de ActiveCampaign para tus automatizaciones). Los números se completan a medida que avanza.',
    pi_noAiYet: 'Aún sin diagnóstico', pi_notRead: 'Conversación aún no leída', pi_readNow: 'Leer ahora',
    pi_leadTitle: 'Conversación y siguiente paso', pi_reading: 'Leyendo la conversación en ActiveCampaign…', pi_rereading: 'Releyendo…',
    pi_ball_rep: 'Esperando por nosotros', pi_ball_lead: 'Esperando al lead', pi_ball_none: 'Nada pendiente',
    pi_lastTouch: 'último toque hace {d}d', pi_by: 'por {n}', pi_touchesN: '{n} toques', pi_never: 'sin toques registrados',
    pi_next: 'Siguiente', pi_when_today: 'hoy', pi_when_this_week: 'esta semana', pi_when_next_week: 'la próxima semana', pi_when_later: 'más adelante',
    pi_nt_call: 'Llamar', pi_nt_sms: 'SMS', pi_nt_email: 'Email', pi_nt_whatsapp: 'WhatsApp', pi_nt_send_offer: 'Enviar la oferta', pi_nt_send_financing: 'Enviar opciones de financiación', pi_nt_book_call: 'Agendar llamada de matrícula', pi_nt_close_lost: 'Cerrar como perdido', pi_nt_wait: 'Esperar',
    pi_stuck: 'Frenado en', pi_objections: 'Objeciones', pi_lastSignal: 'Última señal del lead', pi_evidence: 'De las notas', pi_gaps: 'Falta en el CRM', pi_intent: 'Intención',
    pi_timeline: 'Historial', pi_noTimeline: 'No hay nada registrado en ActiveCampaign para este deal: ni notas ni cambios de etapa.', pi_reread: 'Releer ahora',
    pi_readAt: 'Leído {a} · diagnosticado {b}',
    obj_price: 'Precio', obj_financing: 'Financiación', obj_timing: 'Momento', obj_schedule: 'Horario', obj_job: 'Trabajo', obj_family: 'Familia / pareja', obj_outcomes_doubt: 'Dudas de resultados', obj_program_fit: 'Encaje del programa', obj_competitor: 'Competencia', obj_ghosting: 'Dejó de responder', obj_not_interested: 'Sin interés', obj_other: 'Otro',
    st_not_reached: 'No contactado', st_first_contact: 'Primer contacto', st_qualification: 'Calificación', st_offer: 'Oferta', st_financing: 'Financiación', st_decision: 'Decisión', st_paperwork: 'Papeleo', st_enrolled: 'Matriculado', st_lost: 'Perdido',
    sg_not_reached: 'No contactados', sg_f1: 'F1 poco interés', sg_f2: 'F2 algo de feedback', sg_f3: 'F3 fuerte', sg_f4: 'F4 probable', sg_f5: 'F5 registro enviado', sg_stalled: 'Frenados', sg_other: 'Otra etapa', sg_junk: 'Basura', sg_won: 'Ganados',
    a_script: 'Guion', a_note: 'Nota', a_stage: 'Mover', a_owner: 'Reasignar', a_snooze: 'Posponer', a_done: 'Hecho', a_lost: 'Perdido', a_ac: 'AC',
    a_sms: 'SMS', a_email: 'Email', a_call: 'Inicio de llamada', a_copy: 'Copiar', a_copied: 'Copiado', a_noScripts: 'Aún no hay guiones — primero lee la conversación.', a_generate: 'Leer y escribir guiones',
    a_notePh: '¿Qué pasó? (se guarda como nota del deal en ActiveCampaign)', a_saveNote: 'Guardar en ActiveCampaign', a_alsoDone: 'Marcar también como hecho',
    a_snooze1: 'Mañana', a_snooze3: '3 días', a_snooze7: '1 semana', a_snooze14: '2 semanas',
    a_lostReason: 'Motivo de pérdida', a_lostNote: 'Nota opcional', a_markLost: 'Marcar perdido en ActiveCampaign',
    a_doneToast: 'Hecho — oculto 2 días', a_undo: 'Deshacer', a_saved: 'Guardado en ActiveCampaign', a_moved: 'Movido a {s}', a_reassigned: 'Reasignado a {n}', a_snoozed: 'Pospuesto', a_lostToast: 'Marcado perdido: {r}',
    a_failed: 'ActiveCampaign respondió con error: {e}',
    q_hidden: '{n} pospuestos / hechos', q_showHidden: 'mostrar', q_hideHidden: 'ocultar', q_showMore: 'Mostrar {n} más', q_selectAll: 'Seleccionar los visibles',
    q_selected: '{n} seleccionados', q_clear: 'Limpiar', q_bulkRunning: 'Trabajando… {d}/{n}', q_bulkDone: 'Listo: {d} actualizados, {f} con error', q_hiddenUntil: 'oculto hasta {d}', q_unhide: 'Mostrar de nuevo',
    adv_basis: 'Basado en {n} leads · {r} conversaciones leídas · {d} diagnosticadas', adv_prev: 'Consejo anterior: {d}', adv_ask: 'Pregunta algo más sobre esta lista…', adv_send: 'Preguntar',
    adv_none: 'No hay consejo previo para esta lista — este es el punto de partida. La próxima vez dirá qué cambió.',
  };
  window.I18N.en = { ...window.I18N.en, ...en };
  window.I18N.es = { ...window.I18N.es, ...es };
})();

// ───────────────────────── state ─────────────────────────
const PIPE = {
  summaries: {}, states: {}, insights: {}, scores: {}, meta: {}, advice: new Map(),
  open: new Set(), shown: {}, selected: new Set(), showHidden: new Set(),
  loading: false, loadedAt: 0, loadedKey: '', bulk: null,
};
function pipeClearCache() { PIPE.advice.clear(); PIPE.loadedAt = 0; PIPE.insights = {}; PIPE.scores = {}; }
// One key per set of filtered leads, so the panels always match the filters.
function rowsKey(rows) {
  let h = 0;
  for (const r of rows) { const x = String(r.id); for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; }
  return `${state.region}|${rows.length}|${h}`;
}
let INTEL_TAB = (() => { try { return localStorage.getItem('intelTab') || 'sales'; } catch (e) { return 'sales'; } })();

const PI_DAY = 86400000;
// fmtDate() keeps only the date part; these need the time too.
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString(LANG === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
// Phones/emails inside notes arrive hashed (server lib/pii.js): show a short mask instead of 64 hex chars.
const unhash = (v) => String(v ?? '').replace(/\b[0-9a-f]{64}\b/gi, '•••');
const piAge = (iso) => (iso ? Math.floor((Date.now() - new Date(String(iso).slice(0, 10) + 'T12:00:00')) / PI_DAY) : null);
const PI_RE_ENGAGE = /timing|not now|later|price|precio|financ|money|dinero|schedule|horario|busy|tiempo|no response|no contesta|sin respuesta/i;
const PI_PAY_TERMS = /\$\s?\d|€\s?\d|\bdue\b|deposit|registration fee|first (monthly )?payment|pago|matr[ií]cula/i;
function piStageGroup(stage) {
  const s = String(stage || '');
  const f = s.match(/\bF([1-5])\b/);
  if (f) return 'f' + f[1];
  if (/^won$/i.test(s.trim())) return 'won';
  if (/never answered|no ans|called \dx|no reply|to contact/i.test(s)) return 'not_reached';
  if (/spam|duplicate|stop/i.test(s)) return 'junk';
  if (/responded, lost|stopped responding|follow up later|do not message|low interest/i.test(s)) return 'stalled';
  if (/likely to enroll|reg sent|registration/i.test(s)) return 'f4';
  return 'other';
}

const REC_GROUPS = [
  { key: 'readyToClose', icon: 'target', col: '--s-won', kind: 'open' },
  { key: 'waitingOnUs', icon: 'chat', col: '--s-lostc', kind: 'open' },
  { key: 'unassigned', icon: 'user', col: '--s-2', kind: 'open' },
  { key: 'newToContact', icon: 'phone', col: '--s-active', kind: 'open' },
  { key: 'qualifiedNoOffer', icon: 'star', col: '--s-won', kind: 'open' },
  { key: 'goingCold', icon: 'alert', col: '--s-lostu', kind: 'open' },
  { key: 'needsQualification', icon: 'inbox', col: '--s-active', kind: 'open' },
  { key: 'cleanUp', icon: 'xcircle', col: '--s-lostc', kind: 'open' },
  { key: 'reEngage', icon: 'refresh', col: '--s-2', kind: 'lost' },
  { key: 'lostNoReason', icon: 'flag', col: '--s-lostu', kind: 'lost' },
  { key: 'wonRecently', icon: 'trophy', col: '--s-won', kind: 'won' },
];
function classifyRec(r) {
  const age = piAge(r.date);
  const score = r.admissionsScore || '';
  const sum = PIPE.summaries[String(r.id)];
  if (isActive(r)) {
    if (JUNK_SCORES.includes(score) || /^bad$|very bad/i.test(score)) return 'cleanUp';
    const g = piStageGroup(r.stage);
    if (r.offerSentDate || g === 'f4' || g === 'f5' || PI_PAY_TERMS.test(r.feedback || '')) return 'readyToClose';
    if (!r.assignTo) return 'unassigned';
    if (sum && sum.ballInCourt === 'rep') return 'waitingOnUs';
    if (age != null && age <= 7) return 'newToContact';
    if (GOOD_SCORES.includes(score)) return 'qualifiedNoOffer';
    if (age != null && age > 21) return 'goingCold';
    return 'needsQualification';
  }
  if (isWon(r)) return piAge(r.wonDate || r.date) <= 14 ? 'wonRecently' : null;
  if (r.bucket === 'Lost - Unclassified') return piAge(r.lostDate || r.date) <= 60 ? 'lostNoReason' : null;
  if (r.bucket === 'Lost - Classified') {
    const recent = piAge(r.lostDate || r.date) <= 90;
    const promising = !JUNK_SCORES.includes(score) && !/bad/i.test(score);
    return recent && promising && (r.reasons || []).some((x) => PI_RE_ENGAGE.test(x)) ? 'reEngage' : null;
  }
  return null;
}
// Most urgent first: we owe a reply, then highest intent, then the list's own rule.
function recSort(key) {
  const sum = (r) => PIPE.summaries[String(r.id)] || {};
  const base = (() => {
    if (key === 'newToContact' || key === 'unassigned' || key === 'goingCold') return (a, b) => String(b.date).localeCompare(String(a.date));
    if (key === 'readyToClose' || key === 'waitingOnUs') return (a, b) => ((sum(b).metrics || {}).daysSinceLastTouch ?? -1) - ((sum(a).metrics || {}).daysSinceLastTouch ?? -1);
    const rank = (r) => { const i = SCORE_ORDER.indexOf(r.admissionsScore); return i < 0 ? 50 : i; };
    return (a, b) => rank(a) - rank(b) || String(b.date).localeCompare(String(a.date));
  })();
  return (a, b) => ((sum(a).ballInCourt === 'rep' ? 0 : 1) - (sum(b).ballInCourt === 'rep' ? 0 : 1)) || ((sum(b).intent || 0) - (sum(a).intent || 0)) || base(a, b);
}
const isHiddenNow = (id) => { const s = PIPE.states[String(id)]; return !!(s && s.hiddenUntil && Date.parse(s.hiddenUntil) > Date.now()); };

// ───────────────────────── data ─────────────────────────
async function pipeLoad(rows, { force = false } = {}) {
  const key = rowsKey(rows);
  if (PIPE.loading) return;
  if (!force && PIPE.loadedKey === key && Date.now() - PIPE.loadedAt < 60000) return;
  PIPE.loading = true;
  try {
    const ids = rows.filter((r) => isActive(r) || isWon(r) || /Lost/.test(r.bucket)).map((r) => String(r.id));
    const allIds = rows.map((r) => String(r.id));
    const [sRes, iRes, cRes] = await Promise.all([
      api('/api/pipeline/summaries', { method: 'POST', body: { ids } }),
      api('/api/pipeline/insights', { method: 'POST', body: { region: state.region, ids: allIds } }),
      api('/api/pipeline/scores', { method: 'POST', body: { region: state.region, ids: allIds } }),
    ]);
    if (sRes.ok) { const d = await sRes.json(); PIPE.summaries = d.summaries || {}; PIPE.states = d.states || {}; }
    if (iRes.ok) PIPE.insights[key] = await iRes.json();
    if (cRes.ok) PIPE.scores[key] = await cRes.json();
    PIPE.loadedKey = key; PIPE.loadedAt = Date.now();
  } catch (e) { console.warn('[pipeline]', e.message); }
  PIPE.loading = false;
  if (state.view === 'recommendations') renderRecommendations({ fromLoad: true });
}
async function pipeMeta(pipelineId) {
  const k = String(pipelineId || 'all');
  if (PIPE.meta[k]) return PIPE.meta[k];
  const res = await api('/api/pipeline/meta' + (pipelineId ? '?pipelineId=' + encodeURIComponent(pipelineId) : ''));
  const d = res.ok ? await res.json() : { stages: [], users: [], lostReasons: [] };
  PIPE.meta[k] = d;
  return d;
}

// ───────────────────────── page ─────────────────────────
function intelTabsHtml() {
  return `<div class="seg intel-tabs" id="intel-tabs"><button data-t="sales" class="${INTEL_TAB === 'sales' ? 'active' : ''}">${esc(t('in_sales'))}</button><button data-t="marketing" class="${INTEL_TAB === 'marketing' ? 'active' : ''}">${esc(t('in_marketing'))}</button></div>`;
}
function bindIntelTabs(el) {
  $$('#intel-tabs button', el).forEach((b) => b.addEventListener('click', () => {
    INTEL_TAB = b.dataset.t; try { localStorage.setItem('intelTab', INTEL_TAB); } catch (e) { /* private mode */ }
    renderRecommendations();
  }));
}

function renderRecommendations(o = {}) {
  const el = $('#tab-recommendations');
  if (INTEL_TAB === 'marketing' && window.renderMarketingIntel) {
    el.innerHTML = `${intelTabsHtml()}<div id="mk-root"></div>`;
    bindIntelTabs(el);
    return window.renderMarketingIntel($('#mk-root', el));
  }
  const usePeriod = state.recUsePeriod === '1';
  const rows = ALL.filter((r) => match(r, { skipDate: !usePeriod }));
  if (!o.fromLoad) pipeLoad(rows);
  const groups = Object.fromEntries(REC_GROUPS.map((g) => [g.key, []]));
  rows.forEach((r) => { const k = classifyRec(r); if (k) groups[k].push(r); });
  const openCount = rows.filter(isActive).length;
  const scrollY = window.scrollY;
  const key = rowsKey(rows);
  el.innerHTML = `${intelTabsHtml()}
    <div class="panel"><div class="panel-head" style="margin:0"><div><h2>${esc(t('recTitle'))}</h2><div class="panel-sub">${esc(t('recSub', { n: fmtInt(openCount) }))}</div></div>
      <div class="seg" id="rec-period"><button data-p="0" class="${usePeriod ? '' : 'active'}">${esc(t('recWholePipeline'))}</button><button data-p="1" class="${usePeriod ? 'active' : ''}">${esc(t('recOnlyPeriod', { p: dateLabel() }))}</button></div></div></div>
    <div id="pi-insights">${insightsHtml(PIPE.insights[key], PIPE.scores[key], rows.length)}</div>
    <div id="pi-scores">${scoresHtml(PIPE.scores[key])}</div>
    <div class="rec-grid">${REC_GROUPS.map((g) => recCardHtml(g, groups[g.key].sort(recSort(g.key)))).join('')}</div>
    <div id="bulk-bar"></div>`;
  if (o.fromLoad) window.scrollTo(0, scrollY);
  bindIntelTabs(el);
  $$('#rec-period button', el).forEach((b) => b.addEventListener('click', () => { state.recUsePeriod = b.dataset.p; renderRecommendations(); }));
  $$('[data-toggle]', el).forEach((b) => b.addEventListener('click', () => { const k = b.dataset.toggle; if (PIPE.open.has(k)) PIPE.open.delete(k); else PIPE.open.add(k); renderRecommendations(); }));
  $$('[data-more]', el).forEach((b) => b.addEventListener('click', () => { PIPE.shown[b.dataset.more] = (PIPE.shown[b.dataset.more] || 40) + 40; renderRecommendations(); }));
  $$('[data-hidden-toggle]', el).forEach((b) => b.addEventListener('click', () => { const k = b.dataset.hiddenToggle; if (PIPE.showHidden.has(k)) PIPE.showHidden.delete(k); else PIPE.showHidden.add(k); renderRecommendations(); }));
  $$('[data-ai]', el).forEach((b) => b.addEventListener('click', () => askRecAI(b.dataset.ai, groups[b.dataset.ai])));
  $$('[data-ask]', el).forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); const q = f.querySelector('input').value.trim(); if (q) askRecAI(f.dataset.ask, groups[f.dataset.ask], q); }));
  $$('[data-selall]', el).forEach((cb) => cb.addEventListener('change', () => {
    const k = cb.dataset.selall;
    $$(`.rec-card[data-g="${k}"] [data-sel]`, el).forEach((x) => { x.checked = cb.checked; if (cb.checked) PIPE.selected.add(x.dataset.sel); else PIPE.selected.delete(x.dataset.sel); });
    renderBulkBar();
  }));
  bindQueue(el);
  renderBulkBar();
}

function insightsHtml(ins, sc, n) {
  if (!ins || !ins.byScore) return `<div class="panel"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="width:80%"></div></div>`;
  const vg = ins.byScore['Very Good'] || {}; const g = ins.byScore.Good || {};
  const rate = (x) => (x && x.total ? (x.winRate * 100).toFixed(1) + '%' : '—');
  const cov = ins.coverage || {};
  const quiet = (ins.silence['8-14'] || 0) + (ins.silence['15-30'] || 0) + (ins.silence['30+'] || 0);
  const waiting = (ins.ballInCourt || {}).rep || 0;
  const firstRead = cov.candidates && cov.read / cov.candidates < 0.8;
  const kpi = (cls, label, val, sub) => `<div class="kpi ${cls}"><div class="k-lbl">${esc(label)}</div><div class="k-val">${val}</div><div class="k-sub">${sub}</div></div>`;
  const stages = ['not_reached', 'f1', 'f2', 'f3', 'f4', 'f5', 'stalled', 'other'];
  const maxStage = Math.max(1, ...stages.map((s) => ins.stageCounts[s] || 0));
  const objKeys = [...new Set([...Object.keys(ins.objectionsOpen || {}), ...Object.keys(ins.objectionsWon || {})])]
    .sort((a, b) => (ins.objectionsOpen[b] || 0) - (ins.objectionsOpen[a] || 0)).slice(0, 8);
  const objMax = Math.max(1, ...objKeys.map((k) => Math.max(ins.objectionsOpen[k] || 0, ins.objectionsWon[k] || 0)));
  const cmp = ins.compare || { won: {}, open: {} };
  const cmpRow = (label, a, b) => `<tr><td>${esc(label)}</td><td class="num">${a == null ? '—' : esc(Math.round(a * 10) / 10)}</td><td class="num">${b == null ? '—' : esc(Math.round(b * 10) / 10)}</td></tr>`;
  return `<div class="panel pi-panel">
    <div class="panel-head"><div><h2>${icon('sparkle')} ${esc(t('pi_title'))}</h2><div class="panel-sub">${esc(t('pi_sub'))} · <strong>${esc(t('pi_scope', { n: fmtInt(n || 0) }))}</strong></div></div></div>
    <div class="kpis k8" style="margin-bottom:12px">
      ${kpi(sc && sc.hygiene && sc.hygiene.wonStageOpen ? 'hl-bad' : '', t('pi_wonOpen'), sc && sc.hygiene ? fmtInt(sc.hygiene.wonStageOpen) : '…', esc(t('pi_wonOpenSub')))}
      ${kpi(waiting ? 'hl-bad' : '', t('pi_waiting'), fmtInt(waiting), esc(t('pi_waitingSub')))}
      ${kpi(quiet ? 'hl-bad' : '', t('pi_quiet'), fmtInt(quiet), esc(t('pi_quietSub')))}
      ${kpi('', t('pi_noNotes'), fmtInt(ins.noNotes), esc(t('pi_noNotesSub')))}
      ${kpi('', t('pi_read'), `${fmtInt(cov.read)}<span class="pi-vs">/${fmtInt(cov.candidates)}</span>`, esc(t('pi_readSub', { d: fmtInt(cov.diagnosed), q: fmtInt((ins.sync || {}).aiQueue || 0) })))}
    </div>
    ${firstRead ? `<p class="pi-note">${icon('clock')}${esc(t('pi_firstRead'))}</p>` : ''}
    <div class="pi-cols">
      <div><h3>${esc(t('pi_where'))}</h3><div class="pi-bars">${stages.map((s) => {
        const n = ins.stageCounts[s] || 0;
        return `<div class="pi-bar"><span class="l">${esc(t('sg_' + s))}</span><span class="b"><i style="width:${(n / maxStage) * 100}%;background:var(${s === 'won' ? '--good-ink' : s === 'f4' || s === 'f5' || s === 'f3' ? '--s-won' : '--s-active'})"></i></span><span class="n">${fmtInt(n)}</span></div>`;
      }).join('')}</div></div>
      <div><h3>${esc(t('pi_why'))}</h3>${objKeys.length ? `<div class="pi-bars">${objKeys.map((k) => `<div class="pi-bar two"><span class="l">${esc(t('obj_' + k))}</span><span class="b"><i style="width:${((ins.objectionsOpen[k] || 0) / objMax) * 100}%;background:var(--s-lostc)"></i><i style="width:${((ins.objectionsWon[k] || 0) / objMax) * 100}%;background:var(--good-ink)"></i></span><span class="n"><b title="${esc(t('pi_whyOpen'))}">${fmtInt(ins.objectionsOpen[k] || 0)}</b> · <span class="ok" title="${esc(t('pi_whyWon'))}">${fmtInt(ins.objectionsWon[k] || 0)}</span></span></div>`).join('')}</div><div class="pi-legend"><span><i style="background:var(--s-lostc)"></i>${esc(t('pi_whyOpen'))}</span><span><i style="background:var(--good-ink)"></i>${esc(t('pi_whyWon'))}</span></div>` : `<p class="muted" style="font-size:12.5px">${esc(t('pi_noAiYet'))}</p>`}</div>
      <div><h3>${esc(t('pi_compare'))}</h3><table class="pi-table"><thead><tr><th></th><th class="num">${esc(t('pi_won'))} (${fmtInt(cmp.won.n)})</th><th class="num">${esc(t('pi_open'))} (${fmtInt(cmp.open.n)})</th></tr></thead><tbody>
        ${cmpRow(t('pi_firstTouch'), cmp.won.firstTouchHours, cmp.open.firstTouchHours)}${cmpRow(t('pi_touches'), cmp.won.touches, cmp.open.touches)}${cmpRow(t('pi_notes'), cmp.won.notes, cmp.open.notes)}
        ${cmpRow(t('pi_silence'), null, cmp.open.daysSinceLastTouch)}${cmpRow(t('pi_inStage'), null, cmp.open.daysInStage)}</tbody></table>
        ${(ins.reps || []).length ? `<h3>${esc(t('pi_reps'))}</h3><table class="pi-table"><thead><tr><th>${esc(t('pi_rep'))}</th><th class="num">${esc(t('pi_openQ'))}</th><th class="num">${esc(t('pi_waitingCol'))}</th><th class="num">${esc(t('pi_quietCol'))}</th></tr></thead><tbody>${ins.reps.slice(0, 6).map((r) => `<tr><td>${esc(r.rep)}</td><td class="num">${fmtInt(r.openQualified)}</td><td class="num ${r.waitingOnUs ? 'bad' : ''}">${fmtInt(r.waitingOnUs)}</td><td class="num">${fmtInt(r.quiet7)}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>
    </div></div>`;
}

// ───────────────────────── score → enrollment ─────────────────────────
const sbLabel = (s) => { const k = 'sb_' + String(s).replace(/[^A-Za-z]+/g, '_'); const v = t(k); return v === k ? s : v; };
const pctTxt = (x) => (x == null ? '—' : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
function scoresHtml(sc) {
  if (!sc || !sc.scores) return `<div class="panel"><div class="skeleton" style="width:30%"></div><div class="skeleton" style="width:70%"></div></div>`;
  const main = sc.scores.filter((x) => ['Very Good', 'Good'].includes(x.score));
  const lines = main.map((x) => t('sc_line', { s: sbLabel(x.score), e: fmtInt(x.enrolled), n: fmtInt(x.total), r: pctTxt(x.rate) }));
  const j = sc.journeys || {};
  const months = (sc.cohorts || []).map((c) => c.month);
  const cohortScores = ['Very Good', 'Good', 'No Feedback', 'Bad', 'Not scored'].filter((s) => (sc.cohorts || []).some((c) => c.byScore[s]));
  const hy = sc.hygiene || {};
  const hyg = [hy.enrolledNotWonInAC ? t('sc_hyg1', { n: fmtInt(hy.enrolledNotWonInAC) }) : '', hy.wonStageOpen ? t('sc_hyg2', { n: fmtInt(hy.wonStageOpen) }) : '', hy.wonInACNotEnrolled ? t('sc_hyg3', { n: fmtInt(hy.wonInACNotEnrolled) }) : ''].filter(Boolean);
  return `<div class="panel sc-panel">
    <div class="panel-head"><div><h2>${icon('trophy')} ${esc(t('sc_title'))}</h2><div class="panel-sub">${esc(t('sc_sub'))}</div></div></div>
    ${sc.enrollmentsLoading ? `<p class="pi-note">${icon('clock')}${esc(t('sc_loadingEnr'))}</p>` : ''}
    ${lines.length ? `<p class="sc-lines">${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</p>` : ''}
    <div class="sc-cols">
      <div class="sc-main">
        <table class="pi-table sc-table"><thead><tr><th>${esc(t('sc_score'))}</th><th class="num">${esc(t('sc_leads'))}</th><th class="num">${esc(t('sc_enrolled'))}</th><th class="num">${esc(t('sc_rate'))}</th><th class="num" title="${esc(t('sc_decidedHint'))}">${esc(t('sc_decided'))} ⓘ</th><th class="num">${esc(t('sc_open'))}</th><th class="num">${esc(t('sc_lost'))}</th><th class="num">${esc(t('sc_notWon'))}</th><th class="num">${esc(t('sc_days'))}</th></tr></thead>
        <tbody>${sc.scores.map((x) => `<tr class="${['Very Good', 'Good'].includes(x.score) ? 'q' : ''}"><td>${esc(sbLabel(x.score))}</td><td class="num">${fmtInt(x.total)}</td><td class="num"><strong>${fmtInt(x.enrolled)}</strong></td><td class="num">${pctTxt(x.rate)}</td><td class="num">${pctTxt(x.decidedRate)}</td><td class="num">${fmtInt(x.open)}</td><td class="num">${fmtInt(x.lost)}</td><td class="num ${x.notWonInAC ? 'bad' : ''}">${fmtInt(x.notWonInAC)}</td><td class="num">${x.medianDaysToEnroll == null ? '—' : fmtInt(x.medianDaysToEnroll)}</td></tr>`).join('')}</tbody></table>
        ${months.length ? `<h3>${esc(t('sc_cohorts'))}</h3><table class="pi-table sc-table"><thead><tr><th></th>${months.map((m) => `<th class="num">${esc(m)}</th>`).join('')}</tr></thead><tbody>
          ${cohortScores.map((s) => `<tr><td>${esc(sbLabel(s))}</td>${sc.cohorts.map((c) => { const v = c.byScore[s]; return `<td class="num">${v ? `${fmtInt(v.enrolled)} / ${fmtInt(v.total)}` : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table>` : ''}
      </div>
      <div class="sc-side">
        <div>
        <h3>${esc(t('sc_journeys'))}</h3>
        <p class="muted sc-note">${esc(t('sc_tracking', { d: j.trackingSince || '—', n: fmtInt(j.tracked || 0) }))}</p>
        ${(j.paths || []).length ? `<div class="sc-sub">${esc(t('sc_paths'))}</div><ul class="sc-list">${j.paths.slice(0, 6).map((p) => `<li><strong>${esc(p.path.split(' → ').map((x) => (x === 'Enrolled' ? t('sc_enrolled') : sbLabel(x))).join(' → '))}</strong> · ${fmtInt(p.n)}${p.medianDaysAfterChange != null ? ` <span class="muted">(${esc(t('sc_afterChange', { d: fmtInt(p.medianDaysAfterChange) }))})</span>` : ''}</li>`).join('')}</ul>` : ''}
        ${(j.transitions || []).length ? `<div class="sc-sub">${esc(t('sc_transitions'))}</div><ul class="sc-list">${j.transitions.slice(0, 8).map((x) => `<li>${esc(x.path.split(' → ').map(sbLabel).join(' → '))} · ${fmtInt(x.n)} <span class="muted">(${esc(t('sc_ofWhich', { e: fmtInt(x.enrolled) }))})</span></li>`).join('')}</ul>` : `<p class="muted sc-note">${esc(t('sc_noChanges'))}</p>`}
        </div><div>
        <h3>${esc(t('sc_offPath'))}</h3>
        ${(sc.offPath || []).length ? `<ul class="sc-list">${sc.offPath.map((o) => `<li><strong>${esc(sbLabel(o.score))}</strong> · ${fmtInt(o.n)} <span class="muted">(${o.programs.slice(0, 3).map((p) => `${esc(p.program)} ${fmtInt(p.n)}`).join(', ')})</span></li>`).join('')}</ul>` : `<p class="muted sc-note">${esc(t('sc_offPathNone'))}</p>`}
        </div><div>
        ${hyg.length ? `<h3>${esc(t('sc_hygiene'))}</h3><ul class="sc-list bad">${hyg.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>
    </div></div>`;
}

function recCardHtml(g, list) {
  const hiddenList = list.filter((r) => isHiddenNow(r.id));
  const showHidden = PIPE.showHidden.has(g.key);
  const visible = showHidden ? list : list.filter((r) => !isHiddenNow(r.id));
  const reps = {}; visible.forEach((r) => { const k = r.assignTo || t('unassigned'); reps[k] = (reps[k] || 0) + 1; });
  const topReps = Object.entries(reps).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const adv = PIPE.advice.get(g.key + LANG + state.region);
  const open = PIPE.open.has(g.key);
  const shown = PIPE.shown[g.key] || 40;
  return `<div class="rec-card ${visible.length ? '' : 'empty-card'} ${open ? 'wide' : ''}" data-g="${g.key}">
    <div class="rc-head"><span class="rc-ico" style="background:color-mix(in srgb, var(${g.col}) 16%, transparent);color:var(${g.col})">${icon(g.icon)}</span><h3>${esc(t('g_' + g.key))}</h3><span class="rc-n">${fmtInt(visible.length)}</span></div>
    <p class="rc-why">${esc(t('why_' + g.key))}</p>
    <p class="rc-do"><b>${esc(t('recAction'))}:</b> ${esc(t('do_' + g.key))}</p>
    ${topReps.length ? `<div class="rc-reps">${topReps.map(([k, v]) => `<span class="count-tag">${esc(k)} · ${v}</span>`).join('')}</div>` : ''}
    ${hiddenList.length ? `<div class="rc-hidden">${esc(t('q_hidden', { n: fmtInt(hiddenList.length) }))} · <button class="linkish" data-hidden-toggle="${g.key}">${esc(t(showHidden ? 'q_hideHidden' : 'q_showHidden'))}</button></div>` : ''}
    ${adv ? adviceHtml(g.key, adv) : ''}
    ${visible.length ? `<div class="rc-foot">
      <button class="btn ghost sm" data-toggle="${g.key}">${esc(t(open ? 'hideLeads' : 'viewLeads', { n: fmtInt(visible.length) }))}</button>
      <button class="btn soft sm" data-ai="${g.key}" ${adv && adv.loading ? 'disabled' : ''}>${icon('sparkle')}${esc(t('recAskAI'))}</button></div>
      ${open ? `<div class="q-list">
        <label class="q-selall"><input type="checkbox" data-selall="${g.key}"> ${esc(t('q_selectAll'))}</label>
        ${visible.slice(0, shown).map(queueRowHtml).join('')}
        ${visible.length > shown ? `<button class="btn ghost sm" data-more="${g.key}" style="align-self:center;margin-top:8px">${esc(t('q_showMore', { n: fmtInt(Math.min(40, visible.length - shown)) }))}</button>` : ''}
      </div>` : ''}` : `<p class="muted" style="font-size:12.5px;margin-top:auto">${esc(t('recNone'))}</p>`}
  </div>`;
}

function ballChip(b) {
  if (!b) return '';
  const cls = b === 'rep' ? 'b-lostc' : b === 'lead' ? 'b-neutral' : 'b-neutral';
  return `<span class="badge ${cls}">${esc(t('pi_ball_' + b))}</span>`;
}
function objChips(list) {
  return (list || []).map((o) => `<span class="badge plain b-lostu">${esc(t('obj_' + o))}</span>`).join('');
}
function nextLine(s) {
  if (!s) return `<span class="muted">${esc(t('pi_notRead'))}</span>`;
  if (!s.next) return `<span class="muted">${esc(t('pi_noAiYet'))}</span>${s.metrics ? '' : ''}`;
  return `<b>${esc(t('pi_next'))}:</b> ${esc(t('pi_nt_' + s.next.type))} ${esc(t('pi_when_' + s.next.when))}${s.next.why ? ` — ${esc(s.next.why)}` : ''}`;
}
function touchMeta(s) {
  const m = s && s.metrics;
  if (!m) return '';
  if (!m.touches && !m.notes) return esc(t('pi_never'));
  return [t('pi_lastTouch', { d: m.daysSinceLastTouch ?? '?' }) + (m.lastTouchBy ? ' ' + t('pi_by', { n: m.lastTouchBy }) : ''), t('pi_touchesN', { n: m.touches })].map(esc).join(' · ');
}
function queueRowHtml(r) {
  const id = String(r.id);
  const s = PIPE.summaries[id];
  const st = PIPE.states[id];
  const hidden = isHiddenNow(id);
  const acLink = META.acAppUrl ? `${META.acAppUrl}/app/deals/${encodeURIComponent(id)}` : null;
  return `<div class="q-row ${hidden ? 'is-hidden' : ''}" data-id="${esc(id)}">
    <input type="checkbox" class="q-cb" data-sel="${esc(id)}" ${PIPE.selected.has(id) ? 'checked' : ''} aria-label="select">
    <span class="avatar">${esc(leadInitials(r))}</span>
    <div class="q-main">
      <div class="q-top"><button class="q-name" data-open="${esc(id)}">${leadField(r, 'name')}</button>${scoreBadge(r.admissionsScore)}${s ? ballChip(s.ballInCourt) : ''}${s ? objChips(s.objections) : ''}${s && s.intent ? `<span class="q-intent" title="${esc(t('pi_intent'))}">${'●'.repeat(s.intent)}${'○'.repeat(5 - s.intent)}</span>` : ''}</div>
      <div class="q-meta">${esc([r.assignTo || t('unassigned'), r.stage, fmtDate(r.date)].filter(Boolean).join(' · '))}${s && s.metrics ? ' · ' + touchMeta(s) : ''}${hidden ? ` · <span class="q-hid">${esc(t('q_hiddenUntil', { d: fmtDate(st.hiddenUntil) }))}</span>` : ''}</div>
      <div class="q-next">${nextLine(s)}${!s || s.stale ? ` <button class="linkish" data-act="read" data-id="${esc(id)}">${esc(t('pi_readNow'))}</button>` : ''}</div>
      <div class="q-actions">
        <button class="qa" data-act="script" data-id="${esc(id)}">${icon('chat')}${esc(t('a_script'))}</button>
        <button class="qa" data-act="note" data-id="${esc(id)}">${icon('note')}${esc(t('a_note'))}</button>
        <button class="qa" data-act="stage" data-id="${esc(id)}">${icon('target')}${esc(t('a_stage'))}</button>
        <button class="qa" data-act="owner" data-id="${esc(id)}">${icon('user')}${esc(t('a_owner'))}</button>
        <button class="qa" data-act="snooze" data-id="${esc(id)}">${icon('clock')}${esc(t('a_snooze'))}</button>
        ${hidden ? `<button class="qa" data-act="unhide" data-id="${esc(id)}">${icon('refresh')}${esc(t('q_unhide'))}</button>` : `<button class="qa good" data-act="done" data-id="${esc(id)}">${icon('check')}${esc(t('a_done'))}</button>`}
        ${isActive(r) ? `<button class="qa bad" data-act="lost" data-id="${esc(id)}">${icon('xcircle')}${esc(t('a_lost'))}</button>` : ''}
        ${acLink ? `<a class="qa" target="_blank" rel="noopener" href="${esc(acLink)}">${icon('external')}${esc(t('a_ac'))}</a>` : ''}
      </div>
    </div></div>`;
}

function bindQueue(root) {
  $$('[data-open]', root).forEach((b) => b.addEventListener('click', () => openLead(b.dataset.open)));
  $$('[data-sel]', root).forEach((cb) => cb.addEventListener('change', () => { if (cb.checked) PIPE.selected.add(cb.dataset.sel); else PIPE.selected.delete(cb.dataset.sel); renderBulkBar(); }));
  $$('[data-act]', root).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); onAct(b, b.dataset.act, b.dataset.id); }));
  $$('[data-lead-link]', root).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openLead(a.dataset.leadLink); }));
}

// ───────────────────────── actions ─────────────────────────
const recOf = (id) => ALL.find((x) => String(x.id) === String(id));
async function doAction(id, type, payload = {}, { toast, quiet } = {}) {
  try {
    const res = await api('/api/pipeline/action', { method: 'POST', body: { dealId: id, type, ...payload } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || res.statusText);
    PIPE.states[String(id)] = d.state;
    applyLocal(id, type, payload);
    if (toast && !quiet) showToast(toast);
    refreshAfterAction(id);
    return d;
  } catch (e) {
    showToast(t('a_failed', { e: e.message.slice(0, 140) }));
    throw e;
  }
}
// Mirror what we wrote to AC in the browser copy so the lists move now.
function applyLocal(id, type, p) {
  const r = recOf(id);
  if (!r) return;
  if (type === 'stage' && p.stageTitle) r.stage = p.stageTitle;
  if (type === 'owner' && p.ownerName) r.assignTo = p.ownerName;
  if (type === 'lost') { r.bucket = 'Lost - Classified'; r.reasons = [p.reason]; r.reason = p.reason; r.lostDate = new Date().toISOString().slice(0, 10); }
  if (['note', 'stage', 'owner', 'lost'].includes(type) && PIPE.summaries[String(id)]) PIPE.summaries[String(id)].stale = true;
}
function refreshAfterAction(id) {
  if (state.view === 'recommendations') renderRecommendations({ fromLoad: true });
  const d = $('#lead-drawer');
  if (d && d.classList.contains('open') && d.dataset.leadId === String(id)) loadLeadIntel(recOf(id), { quiet: true });
}

function popMenu(anchor, html, bind) {
  const wasOpen = popEl && popEl.dataset.key === 'pi:' + anchor.dataset.act + ':' + anchor.dataset.id;
  closePopover();
  if (wasOpen) return null;
  const el = document.createElement('div');
  el.className = 'popover pi-pop';
  el.dataset.key = 'pi:' + anchor.dataset.act + ':' + anchor.dataset.id;
  el.innerHTML = html;
  popEl = el;
  placePopover(anchor, el);
  const r = anchor.getBoundingClientRect();
  if (r.bottom + el.offsetHeight + 12 > window.innerHeight) el.style.top = Math.max(12, r.top - el.offsetHeight - 6) + 'px';
  if (bind) bind(el);
  return el;
}

async function onAct(anchor, act, id) {
  const r = recOf(id);
  if (!r) return;
  if (act === 'read') {
    anchor.disabled = true; anchor.textContent = t('pi_rereading');
    try { await fetchLeadIntel(id, true); } catch (e) { showToast(e.message); }
    if (state.view === 'recommendations') renderRecommendations({ fromLoad: true });
    return;
  }
  if (act === 'done') {
    await doAction(id, 'done', {}).catch(() => null);
    undoToast(t('a_doneToast'), () => doAction(id, 'unhide', {}));
    return;
  }
  if (act === 'unhide') { await doAction(id, 'unhide', {}).catch(() => null); return; }
  if (act === 'snooze') {
    popMenu(anchor, `<div class="pop-list">${[1, 3, 7, 14].map((n) => `<div class="pop-opt" data-days="${n}"><span class="lbl">${esc(t('a_snooze' + n))}</span></div>`).join('')}</div>`, (el) => {
      $$('[data-days]', el).forEach((o) => o.addEventListener('click', async () => { closePopover(); await doAction(id, 'snooze', { days: Number(o.dataset.days) }, { toast: t('a_snoozed') }).catch(() => null); }));
    });
    return;
  }
  if (act === 'note') {
    popMenu(anchor, `<div class="pi-form"><textarea rows="4" placeholder="${esc(t('a_notePh'))}"></textarea>
      <label class="pi-check"><input type="checkbox" data-done> ${esc(t('a_alsoDone'))}</label>
      <button class="btn primary sm" data-save>${esc(t('a_saveNote'))}</button></div>`, (el) => {
      const ta = $('textarea', el); setTimeout(() => ta.focus(), 30);
      $('[data-save]', el).addEventListener('click', async () => {
        const text = ta.value.trim(); if (!text) return;
        $('[data-save]', el).disabled = true;
        try {
          if ($('[data-done]', el).checked) await doAction(id, 'done', { note: text }, { toast: t('a_saved') });
          else await doAction(id, 'note', { text }, { toast: t('a_saved') });
          closePopover();
        } catch (e) { $('[data-save]', el).disabled = false; }
      });
    });
    return;
  }
  if (act === 'stage' || act === 'owner') {
    const el = popMenu(anchor, `<div class="pop-empty">…</div>`);
    if (!el) return;
    const meta = await pipeMeta(r.pipelineId);
    if (popEl !== el) return;
    const opts = act === 'stage'
      ? meta.stages.filter((s) => String(s.group) === String(r.pipelineId)).map((s) => ({ id: s.id, label: s.title, cur: s.title === r.stage }))
      : meta.users.map((u) => ({ id: u.id, label: u.name, cur: u.name === r.assignTo }));
    el.innerHTML = `<div class="pop-head"><input type="search" placeholder="${esc(LANG === 'es' ? 'Buscar…' : 'Search…')}"></div><div class="pop-list"></div>`;
    const draw = (q = '') => {
      $('.pop-list', el).innerHTML = opts.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase())).map((o) => `<div class="pop-opt ${o.cur ? 'sel' : ''}" data-v="${esc(o.id)}"><span class="lbl">${esc(o.label)}</span>${o.cur ? icon('check') : ''}</div>`).join('') || `<div class="pop-empty">—</div>`;
      $$('[data-v]', el).forEach((o) => o.addEventListener('click', async () => {
        const opt = opts.find((x) => x.id === o.dataset.v);
        closePopover();
        if (act === 'stage') await doAction(id, 'stage', { stageId: opt.id, stageTitle: opt.label }, { toast: t('a_moved', { s: opt.label }) }).catch(() => null);
        else await doAction(id, 'owner', { ownerId: opt.id, ownerName: opt.label }, { toast: t('a_reassigned', { n: opt.label }) }).catch(() => null);
      }));
    };
    draw();
    $('input', el).addEventListener('input', (e) => draw(e.target.value));
    setTimeout(() => $('input', el).focus(), 30);
    return;
  }
  if (act === 'lost') {
    const el = popMenu(anchor, `<div class="pop-empty">…</div>`);
    if (!el) return;
    const meta = await pipeMeta(r.pipelineId);
    if (popEl !== el) return;
    el.innerHTML = `<div class="pi-form"><label>${esc(t('a_lostReason'))}</label><select>${meta.lostReasons.map((x) => `<option>${esc(x)}</option>`).join('')}</select>
      <label>${esc(t('a_lostNote'))}</label><textarea rows="2"></textarea>
      <button class="btn sm pi-danger" data-save>${esc(t('a_markLost'))}</button></div>`;
    $('[data-save]', el).addEventListener('click', async () => {
      const reason = $('select', el).value; const note = $('textarea', el).value.trim();
      $('[data-save]', el).disabled = true;
      try { await doAction(id, 'lost', { reason, note }, { toast: t('a_lostToast', { r: reason }) }); closePopover(); } catch (e) { $('[data-save]', el).disabled = false; }
    });
    return;
  }
  if (act === 'script') {
    const el = popMenu(anchor, `<div class="pop-empty">…</div>`);
    if (!el) return;
    el.classList.add('wide');
    let intel = PIPE.leadIntel && PIPE.leadIntel[id];
    const draw = (data) => {
      const sc = data && data.intel && data.intel.diagnosis && data.intel.diagnosis.scripts;
      if (!sc || !(sc.sms || sc.emailBody || sc.callOpener)) {
        el.innerHTML = `<div class="pi-form"><p class="muted" style="margin:0">${esc(t('a_noScripts'))}</p><button class="btn primary sm" data-gen>${icon('sparkle')}${esc(t('a_generate'))}</button></div>`;
        $('[data-gen]', el).addEventListener('click', async (e) => { e.target.disabled = true; e.target.textContent = t('pi_reading'); try { draw(await fetchLeadIntel(id, true)); } catch (err) { showToast(err.message); } });
        return;
      }
      el.innerHTML = `<div class="pi-scripts">${scriptBlocks(sc)}</div>`;
      bindCopy(el, sc, id);
    };
    if (!intel) { try { intel = await fetchLeadIntel(id, false); } catch (e) { intel = null; } }
    if (popEl === el) draw(intel);
  }
}
function scriptBlocks(sc) {
  const b = (k, label, text) => (text ? `<div class="template"><div class="template-head">${esc(label)}<button class="btn ghost sm" data-copy="${k}">${esc(t('a_copy'))}</button></div><pre>${esc(text)}</pre></div>` : '');
  return b('sms', t('a_sms'), sc.sms) + b('email', t('a_email'), [sc.emailSubject ? `Subject: ${sc.emailSubject}` : '', sc.emailBody].filter(Boolean).join('\n\n')) + b('call', t('a_call'), sc.callOpener);
}
function bindCopy(root, sc, id) {
  const val = { sms: sc.sms, email: [sc.emailSubject ? `Subject: ${sc.emailSubject}` : '', sc.emailBody].filter(Boolean).join('\n\n'), call: sc.callOpener };
  $$('[data-copy]', root).forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(val[b.dataset.copy] || ''); b.textContent = t('a_copied'); } catch (e) { showToast(t('copyFailed')); }
    api('/api/pipeline/action', { method: 'POST', body: { dealId: id, type: 'script', channel: b.dataset.copy } }).catch(() => {});
  }));
}
function undoToast(msg, undo) {
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `${esc(msg)} <button class="linkish" style="color:inherit;margin-left:8px;text-decoration:underline">${esc(t('a_undo'))}</button>`;
  document.body.appendChild(el);
  el.querySelector('button').addEventListener('click', () => { el.remove(); undo(); });
  setTimeout(() => el.remove(), 5000);
}

// ───────────────────────── bulk ─────────────────────────
function renderBulkBar() {
  const bar = $('#bulk-bar');
  if (!bar) return;
  const n = PIPE.selected.size;
  if (!n && !PIPE.bulk) { bar.innerHTML = ''; bar.className = ''; return; }
  bar.className = 'bulk-bar';
  if (PIPE.bulk) {
    const j = PIPE.bulk;
    bar.innerHTML = `<span>${esc(j.finished ? t('q_bulkDone', { d: j.done, f: j.failed }) : t('q_bulkRunning', { d: j.done + j.failed, n: j.total }))}</span>${j.finished ? `<button class="btn ghost sm" data-bulk-close>${esc(t('close'))}</button>` : ''}`;
    const c = $('[data-bulk-close]', bar); if (c) c.addEventListener('click', () => { PIPE.bulk = null; renderBulkBar(); });
    return;
  }
  bar.innerHTML = `<b>${esc(t('q_selected', { n: fmtInt(n) }))}</b>
    <button class="btn ghost sm" data-bulk="snooze" data-id="bulk" data-act="bulk-snooze">${icon('clock')}${esc(t('a_snooze'))}</button>
    <button class="btn ghost sm" data-bulk="owner" data-id="bulk" data-act="bulk-owner">${icon('user')}${esc(t('a_owner'))}</button>
    <button class="btn ghost sm" data-bulk="done" data-id="bulk" data-act="bulk-done">${icon('check')}${esc(t('a_done'))}</button>
    <button class="btn ghost sm" data-bulk="lost" data-id="bulk" data-act="bulk-lost">${icon('xcircle')}${esc(t('a_lost'))}</button>
    <button class="btn ghost sm" data-bulk-clear>${esc(t('q_clear'))}</button>`;
  $('[data-bulk-clear]', bar).addEventListener('click', () => { PIPE.selected.clear(); renderRecommendations({ fromLoad: true }); });
  $$('[data-bulk]', bar).forEach((b) => b.addEventListener('click', () => onBulk(b, b.dataset.bulk)));
}
async function runBulk(type, payload) {
  const ids = [...PIPE.selected];
  const res = await api('/api/pipeline/bulk', { method: 'POST', body: { ids, type, ...payload } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) { showToast(d.error || res.statusText); return; }
  PIPE.bulk = { total: d.total, done: 0, failed: 0, finished: false };
  renderBulkBar();
  const poll = async () => {
    const r = await api('/api/pipeline/bulk/' + d.jobId).catch(() => null);
    const j = r && r.ok ? await r.json() : null;
    if (j) PIPE.bulk = j;
    renderBulkBar();
    if (j && !j.finished) { setTimeout(poll, 1500); return; }
    if (j && j.errors && j.errors.length) console.warn('[bulk]', j.errors);
    if (type === 'lost') ids.forEach((id) => applyLocal(id, 'lost', payload));
    if (type === 'owner') ids.forEach((id) => applyLocal(id, 'owner', payload));
    PIPE.selected.clear();
    await pipeLoad(ALL.filter((x) => match(x, { skipDate: true })), { force: true });
  };
  setTimeout(poll, 1000);
}
async function onBulk(anchor, type) {
  const anyRec = recOf([...PIPE.selected][0]);
  if (type === 'done') { await runBulk('done', {}); return; }
  if (type === 'snooze') {
    popMenu(anchor, `<div class="pop-list">${[1, 3, 7, 14].map((n) => `<div class="pop-opt" data-days="${n}"><span class="lbl">${esc(t('a_snooze' + n))}</span></div>`).join('')}</div>`, (el) => {
      $$('[data-days]', el).forEach((o) => o.addEventListener('click', () => { closePopover(); runBulk('snooze', { days: Number(o.dataset.days) }); }));
    });
    return;
  }
  const el = popMenu(anchor, `<div class="pop-empty">…</div>`);
  if (!el) return;
  const meta = await pipeMeta(anyRec && anyRec.pipelineId);
  if (popEl !== el) return;
  if (type === 'owner') {
    el.innerHTML = `<div class="pop-list">${meta.users.map((u) => `<div class="pop-opt" data-v="${esc(u.id)}"><span class="lbl">${esc(u.name)}</span></div>`).join('')}</div>`;
    $$('[data-v]', el).forEach((o) => o.addEventListener('click', () => { const u = meta.users.find((x) => x.id === o.dataset.v); closePopover(); runBulk('owner', { ownerId: u.id, ownerName: u.name }); }));
    return;
  }
  if (type === 'lost') {
    el.innerHTML = `<div class="pi-form"><label>${esc(t('a_lostReason'))}</label><select>${meta.lostReasons.map((x) => `<option>${esc(x)}</option>`).join('')}</select>
      <button class="btn sm pi-danger" data-save>${esc(t('a_markLost'))} (${fmtInt(PIPE.selected.size)})</button></div>`;
    $('[data-save]', el).addEventListener('click', () => { const reason = $('select', el).value; closePopover(); runBulk('lost', { reason }); });
  }
}

// ───────────────────────── list advice ─────────────────────────
function adviceHtml(key, adv) {
  if (adv.loading) return `<div class="rc-ai"><span class="dots"><span></span><span></span><span></span></span> ${esc(t('thinking'))}</div>`;
  if (adv.error) return `<div class="rc-ai"><span style="color:var(--bad-ink)">${esc(adv.error)}</span></div>`;
  const linked = mdToHtml(adv.text).replace(/(?<!&)#(\d{2,9})\b/g, '<a href="#" class="lead-ref" data-lead-link="$1">#$1</a>');
  const b = adv.basis || {};
  return `<div class="rc-ai md">${linked}
    <div class="adv-foot">${esc(t('adv_basis', { n: fmtInt(b.leads), r: fmtInt(b.read), d: fmtInt(b.diagnosed) }))}${adv.previousAt ? ' · ' + esc(t('adv_prev', { d: fmtDT(adv.previousAt) })) : ' · ' + esc(t('adv_none'))}</div>
    ${(adv.follow || []).map((f) => `<div class="adv-q"><b>${esc(f.q)}</b>${f.loading ? ` <span class="dots"><span></span><span></span><span></span></span>` : mdToHtml(f.a || '').replace(/(?<!&)#(\d{2,9})\b/g, '<a href="#" class="lead-ref" data-lead-link="$1">#$1</a>')}</div>`).join('')}
    <form class="adv-ask" data-ask="${key}"><input type="text" placeholder="${esc(t('adv_ask'))}"><button class="btn ghost sm">${esc(t('adv_send'))}</button></form>
  </div>`;
}
async function askRecAI(key, list, question) {
  const id = key + LANG + state.region;
  const visible = list.filter((r) => !isHiddenNow(r.id));
  const prev = PIPE.advice.get(id);
  if (question && prev && !prev.loading) {
    prev.follow = (prev.follow || []).concat([{ q: question, loading: true }]);
  } else {
    PIPE.advice.set(id, { loading: true });
  }
  renderRecommendations({ fromLoad: true });
  try {
    const res = await api('/api/pipeline/advice', { method: 'POST', body: {
      region: state.region, group: key, groupName: t('g_' + key), rule: `${t('why_' + key)} ${t('do_' + key)}`,
      ids: visible.map((r) => String(r.id)), lang: LANG, question: question || '',
    } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (question && prev && prev.follow) { const f = prev.follow[prev.follow.length - 1]; f.loading = false; f.a = data.text; }
    else PIPE.advice.set(id, { text: data.text, basis: data.basis, previousAt: data.previousAt, since: data.since, follow: [] });
  } catch (e) {
    if (question && prev && prev.follow) { const f = prev.follow[prev.follow.length - 1]; f.loading = false; f.a = e.message; }
    else PIPE.advice.set(id, { error: e.message });
  }
  if (state.view === 'recommendations') renderRecommendations({ fromLoad: true });
}

// ───────────────────────── lead drawer section ─────────────────────────
PIPE.leadIntel = {};
async function fetchLeadIntel(id, refresh) {
  const res = await api(`/api/pipeline/lead/${encodeURIComponent(id)}${refresh ? '?refresh=1' : ''}`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || res.statusText);
  PIPE.leadIntel[String(id)] = d;
  if (d.intel) {
    const di = d.intel.diagnosis;
    PIPE.summaries[String(id)] = {
      fetchedAt: d.intel.fetchedAt, diagnosedAt: d.intel.diagnosedAt, metrics: d.intel.metrics,
      ballInCourt: di ? di.ballInCourt : null, stuckAt: di ? di.stuckAt : null, objections: di ? di.objections : [],
      intent: di ? di.intent : null, next: di ? di.nextAction : null, summary: di ? di.summary : null, stale: d.intel.stale,
    };
  }
  if (d.state) PIPE.states[String(id)] = { ...d.state, hiddenUntil: d.hiddenUntil };
  return d;
}
async function loadLeadIntel(r, { refresh = false, quiet = false } = {}) {
  if (!r) return;
  const d = $('#lead-drawer');
  if (d) d.dataset.leadId = String(r.id);
  const box = () => $('#ld-intel');
  if (!quiet && box()) box().innerHTML = `<h3>${icon('sparkle')}${esc(t('pi_leadTitle'))}</h3><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:90%"></div><div class="muted" style="font-size:12px">${esc(t(refresh ? 'pi_rereading' : 'pi_reading'))}</div>`;
  try {
    const data = await fetchLeadIntel(r.id, refresh);
    if (!box() || d.dataset.leadId !== String(r.id)) return;
    box().innerHTML = leadIntelHtml(r, data);
    bindQueue(box());
    const sc = data.intel && data.intel.diagnosis && data.intel.diagnosis.scripts;
    if (sc) bindCopy(box(), sc, r.id);
    const rr = $('[data-reread]', box()); if (rr) rr.addEventListener('click', () => loadLeadIntel(r, { refresh: true }));
  } catch (e) {
    if (box()) box().innerHTML = `<h3>${icon('sparkle')}${esc(t('pi_leadTitle'))}</h3><p class="muted">${esc(e.message)}</p>`;
  }
}
function leadIntelHtml(r, data) {
  const it = data.intel;
  const di = it && it.diagnosis;
  const id = String(r.id);
  const actions = `<div class="q-actions" style="margin:10px 0 4px">
    <button class="qa" data-act="note" data-id="${esc(id)}">${icon('note')}${esc(t('a_note'))}</button>
    <button class="qa" data-act="stage" data-id="${esc(id)}">${icon('target')}${esc(t('a_stage'))}</button>
    <button class="qa" data-act="owner" data-id="${esc(id)}">${icon('user')}${esc(t('a_owner'))}</button>
    <button class="qa" data-act="snooze" data-id="${esc(id)}">${icon('clock')}${esc(t('a_snooze'))}</button>
    <button class="qa good" data-act="done" data-id="${esc(id)}">${icon('check')}${esc(t('a_done'))}</button>
    ${isActive(r) ? `<button class="qa bad" data-act="lost" data-id="${esc(id)}">${icon('xcircle')}${esc(t('a_lost'))}</button>` : ''}</div>`;
  const head = `<h3>${icon('sparkle')}${esc(t('pi_leadTitle'))}<span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500;margin-left:auto">${it ? esc(t('pi_readAt', { a: fmtDT(it.fetchedAt), b: it.diagnosedAt ? fmtDT(it.diagnosedAt) : '—' })) : ''}</span></h3>`;
  if (!it) return head + `<p class="muted">${esc(t('pi_notRead'))}</p>` + actions;
  const m = it.metrics || {};
  const diagHtml = di ? `
    <div class="pi-diag">
      <p class="pi-summary">${esc(unhash(di.summary || ''))}</p>
      <div class="pi-tags">${ballChip(di.ballInCourt)}${di.stuckAt ? `<span class="badge plain b-neutral">${esc(t('pi_stuck'))}: ${esc(t('st_' + di.stuckAt))}</span>` : ''}${objChips(di.objections)}<span class="q-intent" title="${esc(t('pi_intent'))}">${'●'.repeat(di.intent || 0)}${'○'.repeat(5 - (di.intent || 0))}</span></div>
      ${di.nextAction ? `<div class="pi-next">${icon('target')}<div><b>${esc(t('pi_nt_' + di.nextAction.type))} ${esc(t('pi_when_' + di.nextAction.when))}</b>${di.nextAction.why ? `<div>${esc(di.nextAction.why)}</div>` : ''}</div></div>` : ''}
      ${di.lastLeadSignal ? `<dl class="kv"><div class="wide"><dt>${esc(t('pi_lastSignal'))}</dt><dd>${esc(unhash(di.lastLeadSignal))}</dd></div></dl>` : ''}
      ${di.objectionDetail ? `<dl class="kv"><div class="wide"><dt>${esc(t('pi_objections'))}</dt><dd>${esc(di.objectionDetail)}</dd></div></dl>` : ''}
      ${scriptBlocks(di.scripts || {})}
      ${(di.evidence || []).length ? `<h4>${esc(t('pi_evidence'))}</h4><ul class="pi-ev">${di.evidence.map((e) => `<li><span class="d">${esc(e.at || '')}</span> ${esc(unhash(e.note || ''))}</li>`).join('')}</ul>` : ''}
      ${(di.dataGaps || []).length ? `<h4>${esc(t('pi_gaps'))}</h4><ul class="pi-ev">${di.dataGaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
    </div>` : `<p class="muted">${esc(t('pi_noAiYet'))}</p>`;
  const tl = (it.timeline || []);
  return head + `
    <div class="stat-row" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="stat"><div class="l">${esc(t('pi_silence'))}</div><div class="v">${m.daysSinceLastTouch ?? '—'}</div></div>
      <div class="stat"><div class="l">${esc(t('pi_touches'))}</div><div class="v">${m.touches ?? 0}</div></div>
      <div class="stat"><div class="l">${esc(t('pi_inStage'))}</div><div class="v">${m.daysInStage ?? '—'}</div></div>
      <div class="stat"><div class="l">${esc(t('pi_firstTouch'))}</div><div class="v">${m.firstTouchHours ?? '—'}</div></div>
    </div>
    ${diagHtml}${actions}
    <h4>${esc(t('pi_timeline'))} <button class="linkish" data-reread style="margin-left:8px">${icon('refresh')}${esc(t('pi_reread'))}</button></h4>
    ${tl.length ? `<div class="timeline pi-tl">${tl.slice(0, 25).map((e) => `<div class="k-${esc(e.kind)}"><span class="d">${fmtDate(e.at, { day: 'numeric', month: 'short' })}</span><span class="w">${esc(e.by)}</span>${e.kind === 'stage' ? icon('target') : ''}<span class="tx">${esc(unhash(e.note))}</span></div>`).join('')}</div>` : `<p class="muted" style="font-size:12.5px">${esc(t('pi_noTimeline'))}</p>`}`;
}

// ───────────────────────── Google Ads sync log ─────────────────────────
// Every qualified lead (Good / Very Good) and where it is on its way to
// Google Ads: pending → queued (handed to n8n) → uploaded / failed.
(function addAdsSyncStrings() {
  const en = {
    nav_adsync: 'Google Ads sync', sub_adsync: 'Every Good / Very Good lead sent to Google Ads as a conversion — uploaded, waiting, pending or failed',
    as_uploaded: 'Uploaded', as_queued: 'Waiting for Google', as_pending: 'Pending', as_failed: 'Failed', as_no_id: 'Can’t be matched', as_all: 'All',
    as_uploadedSub: '{v} in conversion value', as_queuedSub: 'handed to n8n, no answer yet', as_pendingSub: 'goes out within a minute', as_failedSub: 'rejected — retry or check the reason', as_no_idSub: 'no click ID and no email in the CRM',
    as_on: 'Sync is on · {r} · leads created in the last {d} days · last run {t}', as_off: 'Sync is off. Set ADS_SYNC_WEBHOOK_URL and ADS_SYNC_KEY on Railway to turn it on.',
    as_sendNow: 'Send pending now', as_retryFailed: 'Retry all failed ({n})', as_retry: 'Retry', as_search: 'Search deal # or name…',
    as_lead: 'Lead', as_tier: 'Tier', as_status: 'Status', as_match: 'Matched by', as_value: 'Value', as_sent: 'Sent', as_answer: 'Google answer', as_reason: 'Reason',
    as_gclid: 'Click ID', as_email: 'Hashed email', as_vg: 'Very Good', as_good: 'Good', as_none: 'Nothing here.', as_stale: 'no answer after 1h',
    as_retried: '{n} queued again', as_sent2: 'Sent {n} pending leads', as_lastErr: 'Last error: {e}', as_attempts: '{n} attempts',
    as_note: 'Both conversion actions are secondary in Google Ads: they are reported but do not steer bidding until you make one primary.',
  };
  const es = {
    nav_adsync: 'Sync con Google Ads', sub_adsync: 'Cada lead Good / Very Good enviado a Google Ads como conversión — subido, en espera, pendiente o fallido',
    as_uploaded: 'Subidos', as_queued: 'Esperando a Google', as_pending: 'Pendientes', as_failed: 'Fallidos', as_no_id: 'Sin forma de cruzar', as_all: 'Todos',
    as_uploadedSub: '{v} en valor de conversión', as_queuedSub: 'entregados a n8n, sin respuesta aún', as_pendingSub: 'salen en menos de un minuto', as_failedSub: 'rechazados — reintentar o revisar el motivo', as_no_idSub: 'sin click ID ni email en el CRM',
    as_on: 'Sync activo · {r} · leads creados en los últimos {d} días · última corrida {t}', as_off: 'Sync apagado. Configura ADS_SYNC_WEBHOOK_URL y ADS_SYNC_KEY en Railway para activarlo.',
    as_sendNow: 'Enviar pendientes ya', as_retryFailed: 'Reintentar fallidos ({n})', as_retry: 'Reintentar', as_search: 'Buscar deal # o nombre…',
    as_lead: 'Lead', as_tier: 'Nivel', as_status: 'Estado', as_match: 'Cruce por', as_value: 'Valor', as_sent: 'Enviado', as_answer: 'Respuesta de Google', as_reason: 'Motivo',
    as_gclid: 'Click ID', as_email: 'Email hasheado', as_vg: 'Very Good', as_good: 'Good', as_none: 'Nada por aquí.', as_stale: 'sin respuesta tras 1h',
    as_retried: '{n} reenviados a la cola', as_sent2: 'Enviados {n} pendientes', as_lastErr: 'Último error: {e}', as_attempts: '{n} intentos',
    as_note: 'Las dos acciones de conversión son secundarias en Google Ads: se reportan pero no guían la puja hasta que marques una como principal.',
  };
  window.I18N.en = { ...window.I18N.en, ...en };
  window.I18N.es = { ...window.I18N.es, ...es };
})();

const ADS = { data: null, loading: false, status: 'all', tier: 'all', q: '', shown: 100 };
const AS_ORDER = ['uploaded', 'queued', 'pending', 'failed', 'no_id'];
const AS_BADGE = { uploaded: 'b-won', queued: 'b-neutral', pending: 'b-lostu', failed: 'b-lostc', no_id: 'b-neutral' };
const asStale = (r) => r.status === 'queued' && r.sentAt && Date.now() - Date.parse(r.sentAt) > 3600000;

async function loadAdsSync() {
  ADS.loading = true;
  try {
    const res = await api('/api/pipeline/ads-sync/log');
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || res.statusText);
    ADS.data = d; ADS.error = null; ADS.at = Date.now();
  } catch (e) { ADS.error = e.message; ADS.at = Date.now(); }
  ADS.loading = false;
  if (state.view === 'adsync') renderAdsSync($('#tab-adsync'));
}

function renderAdsSync(el) {
  if (!ADS.loading && (!ADS.data || Date.now() - (ADS.at || 0) > 20000)) loadAdsSync();
  if (!ADS.data) {
    el.innerHTML = ADS.error ? `<div class="panel state-card">${icon('alert')}<p>${esc(ADS.error)}</p></div>` : `<div class="kpis">${'<div class="kpi"><div class="skeleton" style="width:50%"></div><div class="skeleton" style="height:28px;width:70%"></div></div>'.repeat(5)}</div>`;
    return;
  }
  const s = ADS.data.summary || {}; const c = s.counts || {};
  const all = ADS.data.rows || [];
  const q = ADS.q.trim().toLowerCase();
  const rows = all.filter((r) => (ADS.status === 'all' || r.status === ADS.status)
    && (ADS.tier === 'all' || r.tier === ADS.tier)
    && (!q || String(r.dealId).includes(q) || String((r.lead && (r.lead.namePartial || '')) || '').toLowerCase().includes(q)));
  const failedKeys = all.filter((r) => r.status === 'failed' || asStale(r)).map((r) => r.key);
  const kpi = (k, val, sub, cls = '') => `<button class="kpi as-kpi ${cls} ${ADS.status === k ? 'sel' : ''}" data-as-status="${k}"><div class="k-lbl"><span class="dot" style="background:var(${k === 'uploaded' ? '--good' : k === 'failed' ? '--bad' : k === 'pending' ? '--warn' : '--s-active'})"></span>${esc(t('as_' + k))}</div><div class="k-val">${fmtInt(val || 0)}</div><div class="k-sub">${esc(sub)}</div></button>`;
  el.innerHTML = `
    <div class="panel as-head">
      <div class="as-line">${s.enabled ? `<span class="as-dot on"></span>${esc(t('as_on', { r: (s.regions || []).join(', '), d: s.lookbackDays, t: s.lastRunAt ? fmtDT(s.lastRunAt) : '—' }))}` : `<span class="as-dot"></span>${esc(t('as_off'))}`}
        ${s.lastError ? `<span class="as-err" title="${esc(s.lastError)}">${esc(t('as_lastErr', { e: s.lastError.slice(0, 80) }))}</span>` : ''}</div>
      <div class="as-actions">
        <button class="btn soft sm" data-as-run ${s.enabled ? '' : 'disabled'}>${icon('upload')}${esc(t('as_sendNow'))}</button>
        ${failedKeys.length ? `<button class="btn ghost sm" data-as-retry-all>${icon('refresh')}${esc(t('as_retryFailed', { n: fmtInt(failedKeys.length) }))}</button>` : ''}
      </div>
      <p class="as-note">${esc(t('as_note'))}</p>
    </div>
    <div class="kpis k8">
      ${kpi('uploaded', c.uploaded, t('as_uploadedSub', { v: fmtMoney(s.uploadedValue || 0) }), 'hl-good')}
      ${kpi('queued', c.queued, t('as_queuedSub'))}
      ${kpi('pending', c.pending, t('as_pendingSub'))}
      ${kpi('failed', c.failed, t('as_failedSub'), c.failed ? 'hl-bad' : '')}
      ${kpi('no_id', c.no_id, t('as_no_idSub'))}
    </div>
    <div class="panel">
      <div class="as-filters">
        <div class="seg seg-sm">${['all', ...AS_ORDER].map((k) => `<button data-as-status="${k}" class="${ADS.status === k ? 'active' : ''}">${esc(t('as_' + k))}</button>`).join('')}</div>
        <div class="seg seg-sm">${['all', 'very_good', 'good'].map((k) => `<button data-as-tier="${k}" class="${ADS.tier === k ? 'active' : ''}">${esc(k === 'all' ? t('as_all') : t(k === 'very_good' ? 'as_vg' : 'as_good'))}</button>`).join('')}</div>
        <input type="search" class="as-search" placeholder="${esc(t('as_search'))}" value="${esc(ADS.q)}">
      </div>
      ${rows.length ? `<div class="as-wrap"><table class="as-table"><thead><tr>
        <th>${esc(t('as_lead'))}</th><th>${esc(t('as_tier'))}</th><th>${esc(t('as_status'))}</th><th>${esc(t('as_match'))}</th><th class="num">${esc(t('as_value'))}</th><th>${esc(t('as_sent'))}</th><th>${esc(t('as_answer'))}</th><th>${esc(t('as_reason'))}</th><th></th></tr></thead><tbody>
        ${rows.slice(0, ADS.shown).map((r) => {
          const L = r.lead || {};
          const stale = asStale(r);
          const match = r.identifier ? (r.identifier === 'gclid' ? t('as_gclid') : t('as_email')) : (r.status === 'no_id' ? '—' : (r.viaGclid || L.hasGclid ? t('as_gclid') : t('as_email')));
          return `<tr>
            <td><button class="q-name" data-open="${esc(r.dealId)}">${L.namePartial ? esc(L.namePartial) : '#' + esc(r.dealId)}</button><div class="muted" style="font-size:11px">#${esc(r.dealId)}${L.owner ? ' · ' + esc(L.owner) : ''}${L.stage ? ' · ' + esc(L.stage) : ''}</div></td>
            <td>${scoreBadge(r.tier === 'very_good' ? 'Very Good' : 'Good')}</td>
            <td><span class="badge ${AS_BADGE[r.status] || 'b-neutral'}">${esc(t('as_' + r.status))}</span>${stale ? `<div class="as-warn">${esc(t('as_stale'))}</div>` : ''}${r.attempts > 1 ? `<div class="muted" style="font-size:11px">${esc(t('as_attempts', { n: r.attempts }))}</div>` : ''}</td>
            <td>${esc(match)}</td>
            <td class="num">${r.value != null ? fmtMoney(r.value) : '—'}</td>
            <td>${r.sentAt ? fmtDT(r.sentAt) : '—'}</td>
            <td>${r.resultAt ? fmtDT(r.resultAt) : '—'}</td>
            <td class="as-reason" title="${esc(r.error || '')}">${r.error ? esc(asReason(r.error)) : ''}</td>
            <td>${r.status === 'failed' || stale ? `<button class="qa" data-as-retry="${esc(r.key)}">${icon('refresh')}${esc(t('as_retry'))}</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
        ${rows.length > ADS.shown ? `<button class="btn ghost sm" data-as-more style="margin-top:10px">${esc(t('q_showMore', { n: fmtInt(Math.min(100, rows.length - ADS.shown)) }))}</button>` : ''}` : `<p class="muted">${esc(t('as_none'))}</p>`}
    </div>`;
  $$('[data-as-status]', el).forEach((b) => b.addEventListener('click', () => { ADS.status = ADS.status === b.dataset.asStatus && b.classList.contains('as-kpi') ? 'all' : b.dataset.asStatus; ADS.shown = 100; renderAdsSync(el); }));
  $$('[data-as-tier]', el).forEach((b) => b.addEventListener('click', () => { ADS.tier = b.dataset.asTier; renderAdsSync(el); }));
  const search = $('.as-search', el);
  if (search) search.addEventListener('input', (e) => { ADS.q = e.target.value; clearTimeout(ADS.t); ADS.t = setTimeout(() => { renderAdsSync(el); const i = $('.as-search', el); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); });
  $$('[data-open]', el).forEach((b) => b.addEventListener('click', () => openLead(b.dataset.open)));
  const more = $('[data-as-more]', el); if (more) more.addEventListener('click', () => { ADS.shown += 100; renderAdsSync(el); });
  const reload = $('[data-as-reload]', el); if (reload) reload.addEventListener('click', () => loadAdsSync());
  const run = $('[data-as-run]', el);
  if (run) run.addEventListener('click', async () => {
    run.disabled = true;
    const before = c.pending || 0;
    const res = await api('/api/pipeline/ads-sync/run', { method: 'POST' }).catch(() => null);
    if (res && res.ok) showToast(t('as_sent2', { n: fmtInt(before) }));
    loadAdsSync();
  });
  const retryKeys = async (keys) => {
    const res = await api('/api/pipeline/ads-sync/retry', { method: 'POST', body: { keys } }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    showToast(t('as_retried', { n: fmtInt(d.retried || 0) }));
    setTimeout(loadAdsSync, 1500);
  };
  const ra = $('[data-as-retry-all]', el); if (ra) ra.addEventListener('click', () => retryKeys(failedKeys));
  $$('[data-as-retry]', el).forEach((b) => b.addEventListener('click', () => { b.disabled = true; retryKeys([b.dataset.asRetry]); }));
}
// Google's errors are long JSON: show the error code in plain words.
function asReason(err) {
  const s = String(err || '');
  const code = (s.match(/"(?:conversionUploadError|dateError|clickConversionError|requestError|authorizationError|[a-zA-Z]+Error)":"([A-Z_]+)"/) || [])[1];
  const map = {
    EXPIRED_EVENT: 'Click older than the conversion window', CLICK_NOT_FOUND: 'Google doesn’t know this click', UNPARSEABLE_GCLID: 'Invalid click ID',
    TOO_RECENT_EVENT: 'Click too recent — retried automatically', TOO_RECENT_CONVERSION_ACTION: 'New conversion action — Google needs 6h, retried automatically', DUPLICATE_ORDER_ID: 'Already in Google', LATER_THAN_MAXIMUM_DATE: 'Conversion time in the future', UNAUTHORIZED_CUSTOMER: 'Click belongs to another Ads account',
    CONVERSION_PRECEDES_EVENT: 'Conversion before the click', NO_CONVERSION_ACTION_FOUND: 'Conversion action missing', CUSTOMER_NOT_ACCEPTED_CUSTOMER_DATA_TERMS: 'Customer data terms not accepted in Google Ads',
  };
  return code ? (map[code] || code.replace(/_/g, ' ').toLowerCase()) : s.replace(/[{}"\\]/g, ' ').slice(0, 90);
}
