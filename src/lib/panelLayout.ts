const COURIER_NAME = process.env.COURIER_NAME ?? "el courier";

export interface NavItem {
  href: string;
  label: string;
  key: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/panel", label: "Paquetes", key: "paquetes" },
  { href: "/panel/tarifas", label: "Tarifas", key: "tarifas" },
  { href: "/panel/informacion", label: "Información", key: "informacion" },
  { href: "/panel/conversaciones", label: "Conversaciones", key: "conversaciones" },
  { href: "/panel/estadisticas", label: "Estadísticas", key: "estadisticas" },
];

const STYLES = `
  :root {
    --bg: #f7f8f7;
    --ink: #1a2420;
    --ink-muted: #5b6b64;
    --ink-faint: #8a978f;
    --line: #dde3de;
    --card: #ffffff;
    --accent: #1f6f5c;
    --accent-soft: #e3ece8;
    --warn: #a66422;
    --warn-soft: #f1e4d2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.5;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  header.topbar {
    background: var(--card);
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 28px;
  }
  header.topbar .brand {
    font-weight: 700;
    font-size: 16px;
    color: var(--ink);
  }
  header.topbar .brand span { color: var(--accent); }
  nav.tabs { display: flex; gap: 4px; }
  nav.tabs a {
    padding: 8px 14px;
    border-radius: 6px;
    color: var(--ink-muted);
    font-size: 13.5px;
    font-weight: 600;
  }
  nav.tabs a:hover { text-decoration: none; background: var(--accent-soft); }
  nav.tabs a.active { background: var(--accent); color: white; }
  .logout-form button {
    background: none;
    border: 1px solid var(--line);
    color: var(--ink-muted);
    font-size: 13px;
    padding: 7px 12px;
    border-radius: 6px;
    cursor: pointer;
  }
  .logout-form button:hover { background: var(--accent-soft); color: var(--ink); }
  main {
    max-width: 980px;
    margin: 0 auto;
    padding: 32px 28px 80px;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.subtitle { color: var(--ink-muted); margin: 0 0 28px; font-size: 14px; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow-x: auto;
  }
  .card + .card { margin-top: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 11px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-faint);
    padding: 10px 16px;
    border-bottom: 1px solid var(--line);
    background: #fbfbfa;
  }
  td { padding: 12px 16px; border-bottom: 1px solid var(--line); font-size: 14px; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  tr.next-up td { background: var(--accent-soft); }
  .link-btn {
    background: none;
    border: none;
    color: var(--warn);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }
  .link-btn:hover { text-decoration: underline; }
  .banner-ok {
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 13.5px;
    font-weight: 600;
    margin-bottom: 18px;
  }
  .inline-form {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: flex-end;
  }
  .inline-form label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
    color: var(--ink-muted);
    font-weight: 600;
  }
  .inline-form input,
  .inline-form select,
  .inline-form textarea {
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 14px;
    font-weight: 400;
    color: var(--ink);
    background: var(--card);
    font-family: inherit;
  }
  .btn-warn {
    background: var(--warn);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 9px 16px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    height: 37px;
  }
  .btn-warn:hover { opacity: 0.9; }
  .pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pill.next { background: var(--accent); color: white; }
  .pill.scheduled { background: var(--accent-soft); color: var(--accent); }
  .pill.cancelled { background: #f2e2e2; color: #a63b3b; }
  .pill.completed { background: #e6e6e6; color: #555; }
  /* Estados de paquete */
  .pill.pending { background: #e6e6e6; color: #555; }
  .pill.picked_up { background: #e4e9f5; color: #3a539b; }
  .pill.in_transit { background: var(--accent-soft); color: var(--accent); }
  .pill.customs { background: #f1e4d2; color: #a66422; }
  .pill.out_for_delivery { background: #ddeeff; color: #1a5aa6; }
  .pill.delivered { background: #dff2e3; color: #1f8f4e; }
  .pill.exception { background: #f2e2e2; color: #a63b3b; }
  .mono {
    font-family: ui-monospace, "Cascadia Code", "Consolas", monospace;
    font-variant-numeric: tabular-nums;
  }
  .empty { padding: 40px 16px; text-align: center; color: var(--ink-faint); }
  .search-box { margin-bottom: 16px; }
  .search-box input {
    width: 100%;
    max-width: 360px;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 14px;
  }
  .back-link { display: inline-block; margin-bottom: 16px; font-size: 13.5px; }

  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .timeline-item {
    display: flex;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  .timeline-item:last-child { border-bottom: none; }
  .timeline-item .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    margin-top: 5px;
    flex-shrink: 0;
  }
  .timeline-item .when { width: 150px; flex-shrink: 0; color: var(--ink-faint); font-size: 12.5px; }
  .timeline-item .what { flex: 1; }
  .timeline-item .what .loc { color: var(--ink-muted); font-size: 13px; }
  .timeline-item .what .note { color: var(--ink-faint); font-size: 12.5px; margin-top: 2px; }

  footer.brand-footer {
    text-align: center;
    padding: 28px 16px 40px;
    font-size: 12px;
    color: var(--ink-faint);
  }
  footer.brand-footer strong { color: var(--ink-muted); }
  .login-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .login-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 36px 32px;
    width: 100%;
    max-width: 340px;
  }
  .login-card h1 { font-size: 18px; }
  .login-card input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 14px;
    margin: 14px 0;
  }
  .login-card button {
    width: 100%;
    padding: 10px 12px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .login-card button:hover { opacity: 0.92; }
  .login-error {
    background: var(--warn-soft);
    color: var(--warn);
    border: 1px solid var(--warn-soft);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .filter-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .filter-tabs a {
    border: 1px solid var(--line);
    background: var(--card);
    color: var(--ink-muted);
    font-size: 13px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 6px;
  }
  .filter-tabs a:hover { background: var(--accent-soft); text-decoration: none; }
  .filter-tabs a.active { background: var(--accent); color: white; border-color: var(--accent); }

  .escalation-note {
    border: 1px solid var(--warn);
    background: var(--warn-soft);
    border-radius: 8px;
    padding: 14px 18px;
    margin-bottom: 16px;
  }
  .escalation-note .label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--warn);
    margin-bottom: 4px;
  }
  .escalation-note p { margin: 0 0 10px; font-size: 14px; color: var(--ink); }

  .transcript {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .msg { display: flex; flex-direction: column; max-width: 70%; }
  .msg-user { align-self: flex-start; align-items: flex-start; }
  .msg-bot { align-self: flex-end; align-items: flex-end; }
  .msg-bubble {
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 14px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .msg-user .msg-bubble { background: #eef0ee; color: var(--ink); border-bottom-left-radius: 2px; }
  .msg-bot .msg-bubble { background: var(--accent-soft); color: var(--ink); border-bottom-right-radius: 2px; }
  .msg-meta { font-size: 11px; color: var(--ink-faint); margin-top: 4px; padding: 0 4px; }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 14px;
    margin-bottom: 24px;
  }
  .stat-tile {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 16px 18px;
  }
  .stat-tile .stat-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin-bottom: 6px;
  }
  .stat-tile .stat-value {
    font-size: 26px;
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .stat-tile .stat-sub { font-size: 12px; color: var(--ink-muted); margin-top: 2px; }
  .bar-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 5px 0; }
  .bar-row .bar-label { width: 110px; flex-shrink: 0; color: var(--ink-muted); }
  .bar-row .bar-track { flex: 1; background: var(--accent-soft); border-radius: 4px; height: 16px; overflow: hidden; }
  .bar-row .bar-fill { background: var(--accent); height: 100%; }
  .bar-row .bar-count { width: 30px; text-align: right; color: var(--ink-faint); font-variant-numeric: tabular-nums; }

  .row-form { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .row-form input, .row-form select, .row-form textarea {
    padding: 6px 8px; border: 1px solid var(--line); border-radius: 5px; font-size: 13px; color: var(--ink); background: var(--card); font-family: inherit;
  }
  .row-form input[type="number"] { width: 90px; }
  .row-form input[type="text"] { width: 160px; }
  .small-btn {
    background: var(--accent); color: white; border: none; border-radius: 5px;
    padding: 6px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer;
  }
  .small-btn:hover { opacity: 0.9; }
  .small-btn.warn { background: var(--warn); }
  .small-btn.ghost { background: transparent; border: 1px solid var(--line); color: var(--ink-muted); }
  .add-card { padding: 20px 24px; margin-top: 20px; }
  .add-card h3 { margin-top: 0; font-size: 15px; }
  .inactive-row { opacity: 0.55; }

  @media (max-width: 720px) {
    header.topbar {
      flex-wrap: wrap;
      padding: 10px 14px;
      row-gap: 8px;
    }
    header.topbar .brand { font-size: 14px; }
    nav.tabs {
      order: 3;
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      gap: 2px;
      padding-bottom: 2px;
      scrollbar-width: thin;
    }
    nav.tabs a {
      padding: 7px 11px;
      font-size: 12.5px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .logout-form button { font-size: 12px; padding: 6px 10px; }
    main { padding: 20px 14px 60px; }
    h1 { font-size: 19px; }
    th, td { padding: 8px 10px; font-size: 13px; }
    .inline-form, .row-form { gap: 8px; }
    .timeline-item { flex-wrap: wrap; }
    .timeline-item .when { width: auto; }
  }
`;

export function renderLayout(opts: { title: string; activeKey: string; body: string }): string {
  const navHtml = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}" class="${item.key === opts.activeKey ? "active" : ""}">${item.label}</a>`,
  ).join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title} · Panel ${escapeHtml(COURIER_NAME)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <header class="topbar">
    <div class="brand">${escapeHtml(COURIER_NAME)} <span>· Panel</span></div>
    <nav class="tabs">${navHtml}</nav>
    <form class="logout-form" method="post" action="/panel/logout">
      <button type="submit">Cerrar sesión</button>
    </form>
  </header>
  <main>
    ${opts.body}
  </main>
  <footer class="brand-footer">Desarrollado por <strong>InnLab CR</strong></footer>
</body>
</html>`;
}

export function renderLogin(opts: { error?: string }): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Iniciar sesión · Panel ${escapeHtml(COURIER_NAME)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="login-wrap">
    <div class="login-card">
      <h1>${escapeHtml(COURIER_NAME)} · Panel</h1>
      <p class="subtitle" style="margin-bottom:0">Acceso solo para el equipo de operaciones</p>
      ${opts.error ? `<div class="login-error" style="margin-top:14px">${escapeHtml(opts.error)}</div>` : ""}
      <form method="post" action="/panel/login">
        <input type="password" name="password" placeholder="Contraseña" autofocus required />
        <button type="submit">Entrar</button>
      </form>
    </div>
  </div>
  <footer class="brand-footer">Desarrollado por <strong>InnLab CR</strong></footer>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
