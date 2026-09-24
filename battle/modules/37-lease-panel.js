/* AI Graph "Leases" panel: every squad's live command leases (BattleLeases, squad-ai.js), highest
   priority first, with owner, time left and progress, plus which lease is holding the squad's mission.
   UI only: no simulation hooks, it only reads BattleLeases while the panel is open. */
(function (root) {
  'use strict';
  if (typeof document === 'undefined' || root.BattleLeasePanel) return;

  var REFRESH_MS = 500,
    ui = { panel: null, button: null, list: null, timer: null, tries: 0 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function squads(sim) {
    var out = [];
    ['us', 'ge'].forEach(function (f) {
      ((sim && sim.factions && sim.factions[f] && sim.factions[f].squads) || []).forEach(function (q) {
        out.push(q);
      });
    });
    return out;
  }
  /* One row per squad with its live leases; also used by the diagnostics exporters. */
  function snapshot(sim) {
    var L = root.BattleLeases,
      t = sim ? +sim.time || 0 : 0;
    if (!L) return [];
    return squads(sim).map(function (q) {
      return {
        squad: String(q.id),
        faction: q.faction,
        phase: q.commandPhase || null,
        missionHeldBy: q._missionHold || null,
        leases: L.active(q, t)
      };
    });
  }
  function progressText(p) {
    if (!p) return '';
    var mark = p.ok === true ? '▲ ' : p.ok === false ? '▼ ' : '';
    return mark + (p.detail || '');
  }
  function render() {
    if (!ui.list) return;
    var rows = snapshot(root.__battle__),
      live = 0;
    rows.forEach(function (r) {
      live += r.leases.length;
    });
    if (ui.button) ui.button.textContent = 'Leases · ' + live;
    if (!rows.length) {
      ui.list.innerHTML = '<div class="lp-empty">No battle running.</div>';
      return;
    }
    ui.list.innerHTML = rows
      .map(function (r) {
        var head =
          '<div class="lp-squad"><b>' +
          esc(r.faction.toUpperCase() + ' ' + r.squad) +
          '</b><span>' +
          esc(r.phase || '') +
          '</span>' +
          (r.missionHeldBy ? '<em>mission held by ' + esc(r.missionHeldBy) + '</em>' : '') +
          '</div>';
        if (!r.leases.length) return head + '<div class="lp-none">no live leases</div>';
        return (
          head +
          r.leases
            .map(function (l) {
              return (
                '<div class="lp-lease' +
                (l.kind === r.missionHeldBy ? ' holding' : '') +
                '"><strong>' +
                esc(l.kind) +
                '</strong><i>' +
                esc(l.owner) +
                ' · p' +
                l.priority +
                '</i><span>' +
                (l.remaining == null ? 'until released' : l.remaining.toFixed(1) + ' s') +
                '</span><small>' +
                esc(l.reason) +
                (l.progress ? ' — ' + esc(progressText(l.progress)) : '') +
                '</small><small class="lp-release">ends: ' +
                esc(l.release) +
                '</small></div>'
              );
            })
            .join('')
        );
      })
      .join('');
  }
  function setOpen(open) {
    if (!ui.panel) return;
    ui.panel.hidden = !open;
    if (ui.timer) clearInterval(ui.timer);
    ui.timer = open ? setInterval(render, REFRESH_MS) : null;
    if (open) render();
  }
  function installStyle() {
    var s = document.createElement('style');
    s.textContent =
      '#agLeasePanel{position:absolute;z-index:14;left:12px;top:12px;width:430px;max-height:calc(100% - 24px);overflow:auto;background:#1b1e21f6;border:1px solid #555b60;border-radius:6px;box-shadow:0 8px 24px #000a;color:#cdd2d5;font:10px Arial}' +
      '#agLeasePanel[hidden]{display:none!important}' +
      '#agLeasePanel .lp-head{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:9px 10px;background:#292d31;border-bottom:1px solid #44494e}' +
      '#agLeasePanel .lp-head b{color:#fff;font-size:11px}#agLeasePanel .lp-head button{background:#34383c;color:#ddd;border:1px solid #555b60;border-radius:4px;cursor:pointer}' +
      '#agLeasePanel .lp-help{padding:7px 10px;color:#929ba1;border-bottom:1px solid #34383c;line-height:1.45}' +
      '#agLeasePanel .lp-squad{display:flex;gap:8px;align-items:baseline;padding:7px 10px 3px;border-top:1px solid #34383c}#agLeasePanel .lp-squad b{color:#fff}#agLeasePanel .lp-squad span{color:#9da5aa}#agLeasePanel .lp-squad em{margin-left:auto;color:#e0b86a;font-style:normal}' +
      '#agLeasePanel .lp-lease{display:grid;grid-template-columns:110px 1fr auto;gap:1px 8px;padding:3px 10px 3px 18px}#agLeasePanel .lp-lease.holding{background:#3a3222}' +
      '#agLeasePanel .lp-lease strong{color:#d8c38a;font:9px ui-monospace,monospace}#agLeasePanel .lp-lease i{color:#8e979d;font-style:normal}#agLeasePanel .lp-lease span{color:#cdd2d5;text-align:right}' +
      '#agLeasePanel .lp-lease small{grid-column:1/4;color:#9da5aa}#agLeasePanel .lp-release{color:#6f787e!important}#agLeasePanel .lp-none,#agLeasePanel .lp-empty{padding:3px 18px 6px;color:#6f787e}';
    document.head.appendChild(s);
  }
  function install() {
    var view = document.getElementById('agView'),
      top = document.getElementById('agTop');
    if (!view || !top) {
      if (ui.tries++ < 20) setTimeout(install, 250);
      return;
    }
    if (document.getElementById('agLeasePanel')) return;
    installStyle();
    var b = document.createElement('button');
    b.id = 'agLeaseButton';
    b.type = 'button';
    b.textContent = 'Leases · 0';
    b.title = 'Live command leases per squad: owner, priority, time left, progress, and which one holds the mission';
    top.insertBefore(b, document.getElementById('agClose') || null);
    b.addEventListener('click', function () {
      setOpen(ui.panel.hidden);
    });
    var p = document.createElement('div');
    p.id = 'agLeasePanel';
    p.hidden = true;
    p.innerHTML =
      '<div class="lp-head"><b>COMMAND LEASES</b><button type="button" id="lpClose">×</button></div>' +
      '<div class="lp-help">Every hold a squad is under: who owns it, why, how long it has left and what ends it. ' +
      '▲/▼ is the lease\'s own progress test. The highlighted lease is the one holding the squad\'s mission this tick.</div>' +
      '<div id="lpList"></div>';
    view.appendChild(p);
    ui.button = b;
    ui.panel = p;
    ui.list = p.querySelector('#lpList');
    p.querySelector('#lpClose').addEventListener('click', function () {
      setOpen(false);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();

  root.BattleLeasePanel = { version: 'leases-v1', snapshot: snapshot, render: render, open: setOpen };
})(typeof window !== 'undefined' ? window : globalThis);
