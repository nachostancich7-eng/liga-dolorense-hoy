const DATA = window.SITE_DATA;
const IMG = window.SITE_IMG || {};
const DIVISIONS = ['6ta', '5ta', '4ta', '3ra', 'Primera'];
let currentView = 'resultados';
let currentDivision = 'Primera';
let currentFecha = null;

const FASE_ORDER = { 'SEMIFINALES': 1000, 'FINAL': 1001 };

// Qué fecha del torneo corresponde "hoy", según el calendario: arranca en 1 la semana
// del lunes de DATA.fechaInicioClausura, y avanza una fecha por semana, desde cada lunes.
// No depende de qué haya cargado — así el Fixture y Resultados pueden mostrar la fecha
// en curso desde el lunes, aunque todavía no tenga resultados publicados.
function fechaActualCalculada() {
  if (!DATA.fechaInicioClausura) return null;
  const inicio = new Date(DATA.fechaInicioClausura + 'T00:00:00');
  const hoy = new Date();
  const diffDias = Math.floor((hoy - inicio) / 86400000);
  if (diffDias < 0) return 1;
  const fecha = Math.floor(diffDias / 7) + 1;
  return Math.max(1, Math.min(9, fecha));
}

// Igual que fechaActualCalculada, pero para Resultados: se queda en la fecha recién
// jugada durante toda la semana, y recién avanza el domingo que arranca la siguiente
// (no el lunes anterior, que es cuando el Fixture ya empieza a mostrarla como "la próxima").
function fechaResultadosCalculada() {
  if (!DATA.fechaInicioClausura) return null;
  const inicio = new Date(DATA.fechaInicioClausura + 'T00:00:00');
  inicio.setDate(inicio.getDate() + 6); // corre el ancla al domingo de la fecha 1
  const hoy = new Date();
  const diffDias = Math.floor((hoy - inicio) / 86400000);
  if (diffDias < 0) return 1;
  const fecha = Math.floor(diffDias / 7) + 1;
  return Math.max(1, Math.min(9, fecha));
}

function availableFechas(division) {
  const fechas = new Set(DATA.matches.filter(m => m.division === division).map(m => m.fecha));
  if (DATA.fixture) {
    // Se suman siempre las fechas del fixture confirmado (aunque ya haya resultados
    // cargados), para poder navegar a la fecha en curso antes de que tenga datos.
    [...(Object.keys(DATA.fixture.A || {})), ...(Object.keys(DATA.fixture.B || {}))]
      .forEach(f => fechas.add(Number(f)));
  }
  return Array.from(fechas).sort((a, b) => {
    const av = typeof a === 'number' ? a : FASE_ORDER[a];
    const bv = typeof b === 'number' ? b : FASE_ORDER[b];
    return av - bv;
  });
}

function parseLocalDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function calcAge(isoDate) {
  const b = parseLocalDate(isoDate);
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

function formatFecha(isoDate) {
  const d = parseLocalDate(isoDate);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderCumpleanos() {
  const root = document.getElementById('cumpleanos-card');
  if (!root) return;
  root.innerHTML = '';
  const today = new Date();
  const dd = today.getDate(), mm = today.getMonth();
  const matches = [];
  Object.entries(DATA.rosters || {}).forEach(([club, roster]) => {
    roster.forEach(j => {
      const b = parseLocalDate(j.nacimiento);
      if (b.getDate() === dd && b.getMonth() === mm) {
        matches.push({ nombre: j.nombre, club, edad: calcAge(j.nacimiento) });
      }
    });
  });
  if (matches.length === 0) return;

  const fechaTexto = today.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const card = el('div', { class: 'cumpleanos-card' }, [
    el('div', { class: 'cumple-fecha', text: fechaTexto.toUpperCase() }),
    el('div', { class: 'eyebrow', text: 'Cumpleaños' }),
    el('div', { class: 'cumple-note', text: '(ejemplo ilustrativo)' }),
  ]);
  const list = el('div', { class: 'cumple-list' });
  matches.forEach(m => {
    list.appendChild(el('div', { class: 'cumple-row' }, [
      el('span', { class: 'cumple-nombre', text: m.nombre }),
      el('span', { text: ` (${m.club}) cumple hoy ${m.edad} años` }),
    ]));
  });
  card.appendChild(list);
  root.appendChild(card);
}
function initials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function badgeColor(seed) {
  const palette = [
    ['#EAF3DE', '#27500A'], ['#E6F1FB', '#0C447C'], ['#FAECE7', '#712B13'],
    ['#E1F5EE', '#085041'], ['#FAEEDA', '#633806'], ['#EEEDFE', '#26215C'],
    ['#FCEBEB', '#791F1F'],
  ];
  let h = 0;
  for (const c of seed) h += c.charCodeAt(0);
  return palette[h % palette.length];
}

function computeStandings(categoria, division) {
  const teams = DATA.teams[categoria];
  const table = {};
  teams.forEach(t => table[t] = { equipo: t, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 });

  DATA.matches
    .filter(m => m.categoria === categoria && m.division === division && (m.fase || 'liga') === 'liga' && m.estado !== 'suspendido')
    .forEach(m => {
      const L = table[m.local], V = table[m.visitante];
      if (!L || !V) return;
      // Resolución de la Liga: ambos equipos pierden el partido 1-0 (sin autores).
      // En la tabla suma como derrota para los dos; en Resultados se muestra sin marcador.
      if (m.estado === 'ambos_pierden') {
        L.pj++; V.pj++;
        L.pp++; V.pp++;
        L.gc += 1; V.gc += 1;
        return;
      }
      L.pj++; V.pj++;
      L.gf += m.golesLocal; L.gc += m.golesVisitante;
      V.gf += m.golesVisitante; V.gc += m.golesLocal;
      if (m.golesLocal > m.golesVisitante) { L.pg++; L.pts += 3; V.pp++; }
      else if (m.golesLocal < m.golesVisitante) { V.pg++; V.pts += 3; L.pp++; }
      else { L.pe++; V.pe++; L.pts++; V.pts++; }
    });

  return Object.values(table).sort((a, b) => (b.pts - a.pts) || ((b.gf - b.gc) - (a.gf - a.gc)));
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => c && e.appendChild(c));
  return e;
}

function renderVallaView(division) {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const etiquetaDivision = division === 'Primera' ? 'Primera' : division;
  ['A', 'B'].forEach(cat => {
    const rows = tablaTorneoActual(cat, division).slice()
      .sort((a, b) => a.gc - b.gc);
    const list = el('div', { class: 'valla-list' });
    rows.forEach((r, i) => {
      list.appendChild(el('div', { class: 'palmares-row' }, [
        el('span', { class: 'palmares-rank', text: String(i + 1) }),
        logoImg(r.equipo, 28),
        el('span', { class: 'titulo', text: r.equipo }),
        el('span', { class: 'palmares-count', text: `${r.gc} goles en contra` }),
      ]));
    });
    root.appendChild(el('div', { class: `cat-block cat-block-${cat}` }, [
      el('div', { class: `cat-header cat-${cat}` }, [
        el('span', { text: `Valla menos vencida · ${etiquetaDivision} ${cat}` }),
      ]),
      list,
    ]));
  });
}

let currentFixtureFecha = null;

function availableFixtureFechas() {
  const a = (DATA.fixture && DATA.fixture.A) ? Object.keys(DATA.fixture.A).map(Number) : [];
  const b = (DATA.fixture && DATA.fixture.B) ? Object.keys(DATA.fixture.B).map(Number) : [];
  const set = new Set([...a, ...b]);
  return [...set].sort((x, y) => x - y);
}

function renderFixtureSwitcher(fechas) {
  if (currentFixtureFecha === null || !fechas.includes(currentFixtureFecha)) {
    const calculada = fechaActualCalculada();
    currentFixtureFecha = (calculada !== null && fechas.includes(calculada)) ? calculada : fechas[0];
  }
  const idx = fechas.indexOf(currentFixtureFecha);

  const prevBtn = el('button', { class: 'fecha-arrow', text: '‹' });
  const nextBtn = el('button', { class: 'fecha-arrow', text: '›' });
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= fechas.length - 1;
  prevBtn.addEventListener('click', () => { currentFixtureFecha = fechas[idx - 1]; renderFixtureCard(); });
  nextBtn.addEventListener('click', () => { currentFixtureFecha = fechas[idx + 1]; renderFixtureCard(); });

  return el('div', { class: 'fecha-switcher fixture-fecha-switcher' }, [
    prevBtn,
    el('span', { class: 'fecha-label', text: `FECHA ${currentFixtureFecha}` }),
    nextBtn,
  ]);
}

function renderFixtureCard() {
  const root = document.getElementById('fixture-card');
  root.innerHTML = '';
  root.appendChild(el('h3', { text: 'Fixture' }));
  if (DATA.fixtureLabel) {
    root.appendChild(el('div', { class: 'meta fixture-label', text: DATA.fixtureLabel }));
  }
  const fechas = availableFixtureFechas();
  if (fechas.length === 0) {
    root.appendChild(el('div', { class: 'empty-state', text: 'El fixture todavía no está confirmado. Lo publicamos en los próximos días.' }));
    return;
  }
  root.appendChild(renderFixtureSwitcher(fechas));
  ['A', 'B'].forEach(cat => {
    const partidos = (DATA.fixture[cat] && DATA.fixture[cat][currentFixtureFecha]) || [];
    if (!partidos.length) return;
    root.appendChild(el('div', { class: `fixture-cat-label cat-${cat}`, text: `Primera ${cat}` }));
    partidos.forEach(p => {
      root.appendChild(el('div', { class: 'fixture-row' }, [
        logoImg(p.local, 24),
        el('span', { class: 'team', text: p.local }),
        el('span', { class: 'vs', text: 'vs' }),
        el('span', { class: 'team away', text: p.visitante }),
        logoImg(p.visitante, 24),
      ]));
    });
  });
}

function renderCampeonesCard() {
  const root = document.getElementById('campeones-card');
  root.innerHTML = '';
  root.appendChild(el('h3', { text: 'Campeones · 1933 - Ap. 2026' }));
  const list = DATA.campeones || [];
  const maxTitulos = Math.max(...list.map(p => p.titulos));

  const renderRow = (p, i) => {
    const minSize = 13, maxSize = 34;
    const scaledSize = Math.round(minSize + (maxSize - minSize) * (p.titulos / maxTitulos));
    return el('div', { class: 'item' }, [
      el('div', { class: 'palmares-row' }, [
        el('span', { class: 'palmares-rank', text: String(i + 1) }),
        logoImg(p.club, 28, p.logoKey),
        el('span', { class: 'titulo', text: p.club }),
        el('span', { class: 'palmares-count', style: `font-size:${scaledSize}px`, text: `${p.titulos}` }),
      ]),
      el('div', { class: 'campeones-stars', text: '★'.repeat(p.titulos) }),
    ]);
  };
  list.slice(0, 10).forEach((p, i) => root.appendChild(renderRow(p, i)));

  if (list.length > 10) {
    const rest = el('div', { class: 'campeones-rest' });
    list.slice(10).forEach((p, i) => rest.appendChild(renderRow(p, i + 10)));
    rest.style.display = 'none';
    const moreBtn = el('button', { class: 'ver-mas-btn', text: `Ver más (${list.length - 10}) ▾` });
    moreBtn.addEventListener('click', () => {
      const open = rest.style.display !== 'none';
      rest.style.display = open ? 'none' : 'block';
      moreBtn.textContent = open ? `Ver más (${list.length - 10}) ▾` : 'Ver menos ▴';
    });
    root.appendChild(rest);
    root.appendChild(moreBtn);
  }

  if (DATA.campeonesNota) {
    root.appendChild(el('div', { class: 'meta campeones-nota', text: DATA.campeonesNota }));
  }
  if (DATA.campeonesCredito) {
    root.appendChild(el('div', { class: 'meta campeones-credito', text: DATA.campeonesCredito }));
  }
}

function renderPlantelCard() {
  const root = document.getElementById('plantel-card');
  root.innerHTML = '';
  root.appendChild(el('h3', { text: 'Planteles' }));
  root.appendChild(el('div', { class: 'meta', text: 'Tocá un escudo para ver la planilla del equipo.' }));

  const grid = el('div', { class: 'plantel-grid' });
  const result = el('div', { class: 'plantel-result' });

  const allTeams = [...(DATA.teams.A || []), ...(DATA.teams.B || [])];
  allTeams.forEach(team => {
    const btn = el('button', { class: 'plantel-crest-btn' }, [
      logoImg(team, 34),
      el('span', { text: team }),
    ]);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.plantel-crest-btn').forEach(b => b.classList.toggle('active', b === btn));
      result.innerHTML = '';
      result.appendChild(el('h4', { text: team }));
      const roster = (DATA.rosters || {})[team];
      if (!roster || roster.length === 0) {
        result.appendChild(el('div', { class: 'empty-state', text: `Todavía no hay planilla cargada para ${team}.` }));
        return;
      }
      const table = el('table', { class: 'pos-table' });
      table.appendChild(el('tr', {}, [
        el('th', { class: 'col-equipo', text: 'Jugador' }),
        el('th', { text: 'Edad' }),
        el('th', { text: 'Nacimiento' }),
      ]));
      roster.forEach(j => {
        table.appendChild(el('tr', {}, [
          el('td', { class: 'col-equipo', text: j.nombre }),
          el('td', { text: String(calcAge(j.nacimiento)) }),
          el('td', { text: formatFecha(j.nacimiento) }),
        ]));
      });
      result.appendChild(el('div', { class: 'table-scroll' }, [table]));
    });
    grid.appendChild(btn);
  });

  root.appendChild(grid);
  root.appendChild(result);
}

function allSponsors() {
  return [...(DATA.sponsors?.destacado || []), ...(DATA.sponsors?.estandar || [])];
}

function sponsorBanner(sponsor) {
  const img = el('img', { src: (IMG.sponsors || {})[sponsor.nombre] || '', alt: sponsor.nombre });
  if (sponsor.instagram) {
    return el('a', {
      class: 'sponsor-card', href: sponsor.instagram,
      target: '_blank', rel: 'noopener noreferrer',
      'aria-label': `${sponsor.nombre} en Instagram`,
    }, [img]);
  }
  return el('div', { class: 'sponsor-card' }, [img]);
}

function renderSponsors() {
  const sponsors = allSponsors();
  const desktop = document.getElementById('sponsors-desktop');
  const mobile = document.getElementById('sponsors-mobile');
  if (desktop) {
    desktop.innerHTML = '';
    sponsors.forEach(s => desktop.appendChild(sponsorBanner(s)));
  }
  if (mobile) {
    mobile.innerHTML = '';
    sponsors.forEach(s => mobile.appendChild(sponsorBanner(s)));
  }
}

function renderExtras() {
  renderFixtureCard();
  renderCampeonesCard();
  renderPlantelCard();
  renderSponsors();
}

function setupMenuToggle() {
  const dropdown = document.getElementById('mobile-dropdown');
  const menuBtn = document.getElementById('menu-btn');
  const header = document.querySelector('.site-header');

  const positionDropdown = () => {
    dropdown.style.top = header.offsetHeight + 'px';
  };
  positionDropdown();
  window.addEventListener('resize', positionDropdown);

  menuBtn.addEventListener('click', () => {
    positionDropdown();
    dropdown.classList.toggle('open');
  });

  const sections = {
    fixture: document.querySelector('.col-fixture'),
    plantel: document.querySelector('.col-plantel'),
    campeones: document.querySelector('.col-campeones'),
  };

  dropdown.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      dropdown.classList.remove('open');

      if (target === 'inicio') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      Object.keys(sections).forEach(key => {
        sections[key].classList.toggle('mobile-shown', key === target);
      });

      sections[target] && sections[target].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function logoImg(team, size, logoKey) {
  const key = logoKey || team;
  const uri = IMG.clubes && IMG.clubes[key];
  const div = el('div', { class: 'badge', style: size ? `width:${size}px;height:${size}px` : '' });
  if (uri) {
    div.appendChild(el('img', { src: uri, alt: team }));
  } else {
    const [bg, txt] = badgeColor(team);
    div.style.background = bg;
    div.style.color = txt;
    div.style.fontWeight = '700';
    div.textContent = initials(team);
  }
  return div;
}

function renderMatches(categoria, division, fecha) {
  const fechaMatches = DATA.matches.filter(m => m.categoria === categoria && m.division === division && m.fecha === fecha);
  const wrap = el('div', { class: 'matches' });
  if (fechaMatches.length === 0) {
    return el('div', { class: 'empty-state', text: 'No hay partidos cargados para esta fecha.' });
  }
  fechaMatches.forEach(m => {
    if (m.estado === 'ambos_pierden') {
      const row = el('div', { class: 'match-row' }, [
        logoImg(m.local),
        el('span', { class: 'team home', text: m.local }),
        el('span', { class: 'score score-sin-resultado', text: '–' }),
        el('span', { class: 'team away', text: m.visitante }),
        logoImg(m.visitante),
      ]);
      const matchEl = el('div', { class: 'match match-suspendido' }, [row]);
      if (m.nota) matchEl.appendChild(el('div', { class: 'match-nota', text: m.nota }));
      wrap.appendChild(matchEl);
      return;
    }
    if (m.estado === 'suspendido') {
      const row = el('div', { class: 'match-row' }, [
        logoImg(m.local),
        el('span', { class: 'team home', text: m.local }),
        el('span', { class: 'score score-suspendido', text: 'SUSPENDIDO' }),
        el('span', { class: 'team away', text: m.visitante }),
        logoImg(m.visitante),
      ]);
      const matchEl = el('div', { class: 'match match-suspendido' }, [row]);
      if (m.nota) matchEl.appendChild(el('div', { class: 'match-nota', text: m.nota }));
      wrap.appendChild(matchEl);
      return;
    }
    const row = el('div', { class: 'match-row' }, [
      logoImg(m.local),
      el('span', { class: 'team home', text: m.local }),
      el('span', { class: 'score', text: `${m.golesLocal} - ${m.golesVisitante}` }),
      el('span', { class: 'team away', text: m.visitante }),
      logoImg(m.visitante),
    ]);
    const localGoals = m.goleadoresLocal.length ? summarizeScorers(m.goleadoresLocal) : '';
    const visGoals = m.goleadoresVisitante.length ? summarizeScorers(m.goleadoresVisitante) : '';
    const matchEl = el('div', { class: 'match' }, [row]);
    if (localGoals || visGoals) {
      matchEl.appendChild(el('div', { class: 'scorers' }, [
        el('span', { text: localGoals }),
        el('span', { class: 'away-scorers', text: visGoals }),
      ]));
    }
    if (m.nota) matchEl.appendChild(el('div', { class: 'match-nota', text: m.nota }));
    wrap.appendChild(matchEl);
  });
  return wrap;
}

function summarizeScorers(list) {
  const counts = {};
  list.forEach(n => counts[n] = (counts[n] || 0) + 1);
  return Object.entries(counts).map(([n, c]) => c > 1 ? `${n} (${c})` : n).join(', ');
}

function renderFechaSwitcher(division) {
  const fechas = availableFechas(division);
  if (fechas.length === 0) return el('div');
  if (currentFecha === null || !fechas.includes(currentFecha)) {
    const calculada = fechaResultadosCalculada();
    if (calculada !== null && fechas.includes(calculada)) {
      currentFecha = calculada;
    } else {
      const hayPartidosJugados = DATA.matches.some(m => m.division === division);
      currentFecha = hayPartidosJugados ? fechas[fechas.length - 1] : fechas[0];
    }
  }
  const idx = fechas.indexOf(currentFecha);

  const prevBtn = el('button', { class: 'fecha-arrow', text: '‹' });
  const nextBtn = el('button', { class: 'fecha-arrow', text: '›' });
  prevBtn.disabled = idx <= 0;
  nextBtn.disabled = idx >= fechas.length - 1;
  prevBtn.addEventListener('click', () => { currentFecha = fechas[idx - 1]; render(); });
  nextBtn.addEventListener('click', () => { currentFecha = fechas[idx + 1]; render(); });

  return el('div', { class: 'fecha-switcher' }, [
    prevBtn,
    el('span', { class: 'fecha-label', text: typeof currentFecha === 'number' ? `FECHA ${currentFecha}` : currentFecha }),
    nextBtn,
  ]);
}

function renderPlayoffRound(categoria, division, fechaLabel) {
  const matches = DATA.matches.filter(m => m.categoria === categoria && m.division === division && m.fecha === fechaLabel);
  if (matches.length === 0) {
    return el('div', { class: 'empty-state', text: 'Todavía no hay partidos cargados para esta instancia.' });
  }
  const series = {};
  matches.forEach(m => {
    const key = m.serie || 'FINAL';
    if (!series[key]) series[key] = {};
    series[key][m.leg] = m;
  });

  const wrap = el('div', { class: 'playoff-wrap' });
  Object.keys(series).sort().forEach(serieKey => {
    const legs = series[serieKey];
    const box = el('div', { class: 'playoff-serie' });
    if (serieKey !== 'FINAL') {
      box.appendChild(el('div', { class: 'playoff-serie-label', text: serieKey }));
    }
    ['ida', 'vuelta'].forEach(legName => {
      const m = legs[legName];
      const legCard = el('div', { class: 'match playoff-leg-card' });
      const row = el('div', { class: 'playoff-leg', 'data-leg': legName }, [
        el('span', { class: 'leg-tag', text: legName === 'ida' ? 'Ida' : 'Vta' }),
      ]);
      let scorersRow = null;
      if (m && m.golesLocal !== null && m.golesLocal !== undefined) {
        row.appendChild(logoImg(m.local));
        row.appendChild(el('span', { class: 'team home', text: m.local }));
        row.appendChild(el('span', { class: 'score', text: `${m.golesLocal} - ${m.golesVisitante}` }));
        row.appendChild(el('span', { class: 'team away', text: m.visitante }));
        row.appendChild(logoImg(m.visitante));
        const localGoals = m.goleadoresLocal.length ? summarizeScorers(m.goleadoresLocal) : '';
        const visGoals = m.goleadoresVisitante.length ? summarizeScorers(m.goleadoresVisitante) : '';
        if (localGoals || visGoals) {
          scorersRow = el('div', { class: 'scorers' }, [
            el('span', { text: localGoals }),
            el('span', { class: 'away-scorers', text: visGoals }),
          ]);
        }
      } else if (m) {
        // Scheduled: teams already known, no score yet
        row.appendChild(logoImg(m.local));
        row.appendChild(el('span', { class: 'team home', text: m.local }));
        row.appendChild(el('span', { class: 'score', text: '-' }));
        row.appendChild(el('span', { class: 'team away', text: m.visitante }));
        row.appendChild(logoImg(m.visitante));
      } else {
        row.appendChild(el('span', { class: 'team-tbd', text: 'A confirmar' }));
      }
      legCard.appendChild(row);
      if (scorersRow) legCard.appendChild(scorersRow);
      box.appendChild(legCard);
    });

    const idaPlayed = legs.ida && legs.ida.golesLocal !== null && legs.ida.golesLocal !== undefined;
    const vueltaPlayed = legs.vuelta && legs.vuelta.golesLocal !== null && legs.vuelta.golesLocal !== undefined;
    if (idaPlayed && vueltaPlayed) {
      const ida = legs.ida, vta = legs.vuelta;
      // global uses the same two teams regardless of who was local each leg
      const teamA = ida.local, teamB = ida.visitante;
      const golesA = ida.golesLocal + (vta.local === teamA ? vta.golesLocal : vta.golesVisitante);
      const golesB = ida.golesVisitante + (vta.local === teamB ? vta.golesLocal : vta.golesVisitante);
      box.appendChild(el('div', { class: 'playoff-global' }, [
        el('span', { text: `Global: ${teamA} ${golesA} - ${golesB} ${teamB}` }),
      ]));
    }
    wrap.appendChild(box);
  });
  return wrap;
}

function renderResultadosView(division) {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const etiquetaDivision = division === 'Primera' ? 'PRIMERA' : division.toUpperCase();
  root.appendChild(renderFechaSwitcher(division));
  ['A', 'B'].forEach((cat) => {
    const isPlayoff = currentFecha === 'SEMIFINALES' || currentFecha === 'FINAL';
    const content = isPlayoff
      ? renderPlayoffRound(cat, division, currentFecha)
      : renderMatches(cat, division, currentFecha);
    const block = el('div', { class: `cat-block cat-block-${cat}` }, [
      el('div', { class: `cat-header cat-${cat}` }, [
        el('span', { text: `${etiquetaDivision} ${cat}` }),
      ]),
      content,
    ]);
    root.appendChild(block);
  });
}

function rankBadgeClass(i, len, kind) {
  if (kind === 'playoff') return i < 4 ? 'playoff' : '';
  if (kind === 'ascenso') return i === 0 ? 'ascenso' : '';
  if (kind === 'descenso') return i >= len - 2 ? 'descenso' : '';
  return '';
}

/* ============================================================
   CLASIFICADOS MATEMATICAMENTE A PLAY OFF
   Simula TODOS los resultados posibles de los partidos que
   faltan segun el fixture, en el peor escenario para cada
   equipo: pierde todos los suyos (el rival se lleva los 3) y
   cualquier empate en puntos se le resuelve en contra. Si aun
   asi nunca queda fuera de los 4 primeros, esta clasificado
   pase lo que pase, con cualquier criterio de desempate.
   Solo se calcula cuando queda UNA fecha o menos por jugar.
   ============================================================ */
const CUPOS_PLAYOFF = 4;

function clavePartido(fecha, a, b) {
  return fecha + '|' + [a, b].sort().join('|');
}

function partidosPendientes(categoria, division) {
  const fx = DATA.fixture && DATA.fixture[categoria];
  if (!fx) return null;                     // sin fixture no se puede afirmar nada
  const jugados = new Set();
  DATA.matches
    .filter(m => m.categoria === categoria && m.division === division && (m.fase || 'liga') === 'liga')
    .forEach(m => {
      const jugado = m.estado === 'ambos_pierden' ||
        (m.golesLocal !== null && m.golesLocal !== undefined && m.estado !== 'suspendido');
      if (jugado) jugados.add(clavePartido(m.fecha, m.local, m.visitante));
    });
  const resto = [];
  Object.keys(fx).forEach(f => {
    (fx[f] || []).forEach(p => {
      if (!jugados.has(clavePartido(f, p.local, p.visitante))) resto.push([p.local, p.visitante]);
    });
  });
  return resto;
}

function clasificadosPlayoff(categoria, division) {
  const vacio = new Set();
  const resto = partidosPendientes(categoria, division);
  if (!resto) return vacio;
  const equipos = DATA.teams[categoria] || [];
  if (!equipos.length) return vacio;
  // Una fecha = la mitad de los equipos. Mientras falte mas de una, no se muestra nada.
  if (resto.length > Math.floor(equipos.length / 2)) return vacio;

  const base = {};
  equipos.forEach(e => { base[e] = 0; });
  computeStandings(categoria, division).forEach(r => { base[r.equipo] = r.pts; });

  const out = new Set();
  equipos.forEach(X => {
    const p0 = Object.assign({}, base);
    const otros = [];
    resto.forEach(par => {
      if (par[0] === X) p0[par[1]] += 3;
      else if (par[1] === X) p0[par[0]] += 3;
      else otros.push(par);
    });
    const meta = p0[X];
    const total = Math.pow(3, otros.length);
    let seguro = true;
    for (let s = 0; s < total && seguro; s++) {
      const p = Object.assign({}, p0);
      let n = s;
      for (let k = 0; k < otros.length; k++) {
        const a = otros[k][0], b = otros[k][1], o = n % 3;
        n = (n / 3) | 0;
        if (o === 0) p[a] += 3;
        else if (o === 1) p[b] += 3;
        else { p[a] += 1; p[b] += 1; }
      }
      let arriba = 0;
      for (let q = 0; q < equipos.length; q++) {
        if (equipos[q] !== X && p[equipos[q]] >= meta) arriba++;
      }
      if (arriba >= CUPOS_PLAYOFF) seguro = false;
    }
    if (seguro) out.add(X);
  });
  return out;
}

/* Puestos que ya NO pueden cambiar: recorre todos los resultados posibles de
   los partidos que faltan y se queda con los equipos cuyo puesto es el mismo
   en TODOS los escenarios. Los empates en puntos cuentan en contra (el rival
   empatado puede quedar arriba o abajo), asi que un puesto solo se da por
   definido si lo esta con cualquier criterio de desempate. */
function posicionesDefinidas(categoria, division) {
  const definidas = {};
  const resto = partidosPendientes(categoria, division);
  if (resto === null) return definidas;
  const rows = tablaTorneoActual(categoria, division);
  if (resto.length === 0) {                      // ya se jugo todo: manda la tabla real
    rows.forEach((r, i) => { if (i < CUPOS_PLAYOFF) definidas[i + 1] = r.equipo; });
    return definidas;
  }
  const equipos = DATA.teams[categoria] || [];
  if (!equipos.length || resto.length > Math.floor(equipos.length / 2)) return definidas;

  const base = {};
  equipos.forEach(e => { base[e] = 0; });
  computeStandings(categoria, division).forEach(r => { base[r.equipo] = r.pts; });

  const rango = {};
  equipos.forEach(e => { rango[e] = { min: Infinity, max: 0 }; });
  const total = Math.pow(3, resto.length);
  for (let s = 0; s < total; s++) {
    const p = Object.assign({}, base);
    let n = s;
    for (let k = 0; k < resto.length; k++) {
      const a = resto[k][0], b = resto[k][1], o = n % 3;
      n = (n / 3) | 0;
      if (o === 0) p[a] += 3;
      else if (o === 1) p[b] += 3;
      else { p[a] += 1; p[b] += 1; }
    }
    for (let i = 0; i < equipos.length; i++) {
      const X = equipos[i];
      let mejores = 0, igualesOMejores = 0;
      for (let j = 0; j < equipos.length; j++) {
        const e = equipos[j];
        if (e === X) continue;
        if (p[e] > p[X]) { mejores++; igualesOMejores++; }
        else if (p[e] === p[X]) igualesOMejores++;
      }
      const r = rango[X];
      if (mejores + 1 < r.min) r.min = mejores + 1;
      if (igualesOMejores + 1 > r.max) r.max = igualesOMejores + 1;
    }
  }
  equipos.forEach(X => {
    const r = rango[X];
    if (r.min === r.max && r.min <= CUPOS_PLAYOFF) definidas[r.min] = X;
  });
  return definidas;
}

/* ============================================================
   LLAVE DE SEMIFINALES
   1° vs 4° y 2° vs 3°. Los escudos y nombres aparecen recien
   cuando esa division jugo todas sus fechas.
   ============================================================ */
function llaveSemifinales(categoria, division) {
  const resto = partidosPendientes(categoria, division);
  if (resto === null) return null;                 // sin fixture no afirmamos nada
  const definidas = posicionesDefinidas(categoria, division);
  const cuantas = Object.keys(definidas).length;
  const confirmado = cuantas >= CUPOS_PLAYOFF;

  let estado;
  if (confirmado) estado = 'Confirmadas';
  else if (cuantas > 0) estado = cuantas + ' de ' + CUPOS_PLAYOFF + ' definidos';
  else estado = 'A confirmar';

  const caja = el('div', { class: 'llave' + (confirmado ? ' llave-ok' : '') }, [
    el('div', { class: 'llave-titulo' }, [
      el('span', { text: 'Semifinales' }),
      el('span', { class: 'llave-estado', text: estado }),
    ]),
  ]);
  const grilla = el('div', { class: 'llave-grilla' });
  [[1, 4], [2, 3]].forEach((par, n) => {
    const serie = el('div', { class: 'llave-serie' }, [
      el('div', { class: 'llave-serie-label', text: 'Semifinal ' + (n + 1) }),
    ]);
    par.forEach((pos, k) => {
      const club = definidas[pos] || null;
      serie.appendChild(el('div', { class: 'llave-slot' + (club ? '' : ' llave-slot-vacio') }, [
        el('span', { class: 'llave-pos', text: pos + '°' }),
        club ? logoImg(club) : el('span', { class: 'llave-escudo-vacio' }),
        el('span', { class: 'llave-nombre', text: club || 'A confirmar' }),
      ]));
      if (k === 0) serie.appendChild(el('div', { class: 'llave-vs', text: 'vs' }));
    });
    grilla.appendChild(serie);
  });
  caja.appendChild(grilla);
  caja.appendChild(el('div', { class: 'llave-nota', text: 'La localía de cada serie se define durante la semana.' }));
  return caja;
}

/* ============================================================
   TABLA ANUAL: puntos de PRIMERA DIVISION en los torneos del año.
   Arranca de la tabla final del Apertura (DATA.anualBase, con goles
   y quita de puntos como la publico la Liga) y le suma el torneo
   en curso.
   ============================================================ */
function computeAnual(categoria) {
  const base = (DATA.anualBase && DATA.anualBase[categoria]) || {};
  const acc = {};
  Object.keys(base).forEach(e => {
    const b = base[e];
    acc[e] = {
      equipo: e, pts: b.pts || 0, pj: b.pj || 0, pg: b.pg || 0, pe: b.pe || 0,
      pp: b.pp || 0, gf: b.gf || 0, gc: b.gc || 0, quita: b.quita || 0,
    };
  });
  if (DATA.torneo !== DATA.anualBaseTorneo) {
    tablaTorneoActual(categoria, 'Primera').forEach(f => {
      if (!acc[f.equipo]) {
        acc[f.equipo] = { equipo: f.equipo, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, quita: 0 };
      }
      const a = acc[f.equipo];
      a.pts += f.pts || 0; a.pj += f.pj || 0; a.pg += f.pg || 0;
      a.pe += f.pe || 0; a.pp += f.pp || 0; a.gf += f.gf || 0; a.gc += f.gc || 0;
    });
  }
  return Object.values(acc).sort((a, b) =>
    (b.pts - a.pts) || ((b.gf - b.gc) - (a.gf - a.gc)) || (b.gf - a.gf));
}

/* Reglamento: hay UN descenso por cada tabla. El ultimo de la Tabla Anual
   (solo Primera) baja por esa via y el ultimo de la Tabla General (1ra + 3ra
   + 4ta) por la suya. Cuando es el mismo club, ocupa el cupo de la tabla que
   manda y el otro descenso pasa al anteultimo de SU tabla.

   >>> Si la Liga cambia cual manda, se cambia SOLO esta linea: 'anual' o 'general'. */
const DESCENSO_PRIORIDAD = 'anual';

function computeDescensos(categoria) {
  const anual = computeAnual(categoria);
  const general = computeSumatoria(categoria);
  if (!anual.length || !general.length) {
    return { porAnual: null, porGeneral: null, reglaAplicada: false, desplazada: null };
  }
  let porAnual = anual[anual.length - 1].equipo;
  let porGeneral = general[general.length - 1].equipo;
  let reglaAplicada = false, desplazada = null;
  if (porAnual === porGeneral) {
    if (DESCENSO_PRIORIDAD === 'anual' && general.length > 1) {
      porGeneral = general[general.length - 2].equipo;
      reglaAplicada = true; desplazada = 'general';
    } else if (DESCENSO_PRIORIDAD === 'general' && anual.length > 1) {
      porAnual = anual[anual.length - 2].equipo;
      reglaAplicada = true; desplazada = 'anual';
    }
  }
  // Cada tabla marca en rojo a su propio ultimo y al club que se lleva su cupo.
  // Si son el mismo, queda una sola fila marcada.
  const marcasAnual = new Set([anual[anual.length - 1].equipo, porAnual]);
  const marcasGeneral = new Set([general[general.length - 1].equipo, porGeneral]);
  return { porAnual, porGeneral, reglaAplicada, desplazada, marcasAnual, marcasGeneral };
}

function anualTable(rows, marcados) {
  const wrap = el('div', { class: 'table-scroll' });
  const table = el('table', { class: 'pos-table' });
  table.appendChild(el('tr', {}, [
    el('th', { text: '#' }), el('th', { class: 'col-equipo', text: 'Equipo' }),
    el('th', { text: 'PTS' }), el('th', { text: 'J' }), el('th', { text: 'G' }),
    el('th', { text: 'E' }), el('th', { text: 'P' }), el('th', { text: 'Gol' }), el('th', { text: '+/-' }),
  ]));
  rows.forEach((r, i) => {
    const dg = r.gf - r.gc;
    const celda = el('div', { class: 'team-cell' }, [logoImg(r.equipo), el('span', { text: r.equipo })]);
    if (r.quita) {
      celda.appendChild(el('span', {
        class: 'quita-badge', title: 'Quita de ' + r.quita + ' puntos', text: '−' + r.quita,
      }));
    }
    table.appendChild(el('tr', {}, [
      el('td', {}, [el('span', { class: 'rank-badge ' + ((marcados && marcados.has(r.equipo)) ? 'descenso' : ''), text: String(i + 1) })]),
      el('td', { class: 'col-equipo' }, [celda]),
      el('td', { class: 'col-pts', text: String(r.pts) }),
      el('td', { text: String(r.pj) }), el('td', { text: String(r.pg) }),
      el('td', { text: String(r.pe) }), el('td', { text: String(r.pp) }),
      el('td', { text: r.gf + ':' + r.gc }),
      el('td', { text: dg > 0 ? '+' + dg : String(dg) }),
    ]));
  });
  wrap.appendChild(table);
  return wrap;
}

function renderAnualView() {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const bloque = el('div', { class: 'anual-block' }, [
    el('div', { class: 'section-label', text: `TABLA ANUAL ${DATA.temporada || ''} · PRIMERA DIVISIÓN`.trim() }),
    el('div', { class: 'section-note', text: 'Suma los puntos de Primera División en los torneos del año.' }),
  ]);
  ['A', 'B'].forEach(cat => {
    const desc = cat === 'A' ? computeDescensos('A') : null;
    bloque.appendChild(el('div', { class: 'anual-cat-header' }, [
      el('span', { class: 'dot dot-' + cat }), el('span', { text: 'Primera ' + cat }),
    ]));
    bloque.appendChild(anualTable(computeAnual(cat), desc ? desc.marcasAnual : null));
    if (desc && desc.porAnual) {
      bloque.appendChild(el('div', { class: 'legend' }, [
        el('span', { class: 'legend-item' }, [
          el('span', { class: 'rank-badge descenso' }),
          el('span', { text: 'Desciende por tabla anual' }),
        ]),
      ]));

    }
  });
  root.appendChild(bloque);
}

// Corta la tabla de goleadores en los primeros N PUESTOS, no en N filas:
// si varios empatan en el ultimo puesto que entra, aparecen todos.
function topGoleadores(list, puestos) {
  if (list.length <= puestos) return list.slice();
  const corte = list[puestos - 1].goles;
  return list.filter(g => g.goles >= corte);
}

function posTable(rows, kind, clasificados) {
  const wrap = el('div', { class: 'table-scroll' });
  const table = el('table', { class: 'pos-table' });
  table.appendChild(el('tr', {}, [
    el('th', { text: '#' }),
    el('th', { class: 'col-equipo', text: 'Equipo' }),
    el('th', { text: 'PTS' }),
    el('th', { text: 'J' }),
    el('th', { text: 'G' }),
    el('th', { text: 'E' }),
    el('th', { text: 'P' }),
    el('th', { text: 'Gol' }),
    el('th', { text: '+/-' }),
  ]));
  rows.forEach((r, i) => {
    const cls = rankBadgeClass(i, rows.length, kind);
    const dg = r.gf - r.gc;
    table.appendChild(el('tr', {}, [
      el('td', {}, [el('span', { class: `rank-badge ${cls}`, text: String(i + 1) })]),
      el('td', { class: 'col-equipo' }, [
        (function () {
          const celda = el('div', { class: 'team-cell' }, [logoImg(r.equipo), el('span', { text: r.equipo })]);
          if (clasificados && clasificados.has(r.equipo)) {
            celda.appendChild(el('span', {
              class: 'clasif-badge', title: 'Clasificado a play off',
              'aria-label': 'Clasificado a play off', text: '\u2713'
            }));
          }
          return celda;
        })()
      ]),
      el('td', { class: 'col-pts', text: (r.pts === null || r.pts === undefined) ? '-' : String(r.pts) }),
      el('td', { text: String(r.pj) }),
      el('td', { text: String(r.pg) }),
      el('td', { text: String(r.pe) }),
      el('td', { text: String(r.pp) }),
      el('td', { text: `${r.gf}:${r.gc}` }),
      el('td', { text: dg > 0 ? `+${dg}` : String(dg) }),
    ]));
  });
  wrap.appendChild(table);
  return wrap;
}

// Tabla del torneo en curso: si hay una tabla oficial cargada se usa esa
// (puede diferir de la calculada por sanciones o puntos administrativos).
function tablaTorneoActual(categoria, division) {
  const oficial = DATA.posicionesFinales && DATA.posicionesFinales[categoria];
  if (oficial && division === 'Primera') return oficial;
  return computeStandings(categoria, division);
}

// Sumatoria general = puntos de Primera + 3ra + 4ta de cada club.
// Arranca de una base confirmada a mano (DATA.sumatoriaBase, tal como la
// publica Fotodeportiva) y le suma lo que se juegue del torneo en curso,
// partido a partido, en esas tres divisiones.
function computeSumatoria(categoria) {
  const base = (DATA.sumatoriaBase && DATA.sumatoriaBase[categoria]) || {};
  const acc = {};
  Object.keys(base).forEach(equipo => {
    acc[equipo] = {
      equipo,
      pts1ra: base[equipo].pts1ra || 0,
      pts3ra: base[equipo].pts3ra || 0,
      pts4ta: base[equipo].pts4ta || 0,
    };
  });
  // Si el torneo actual ya está reflejado en la base (recién archivado), no sumar de nuevo.
  if (DATA.torneo !== DATA.sumatoriaBaseTorneo) {
    const sumarDivision = (division, campo) => {
      tablaTorneoActual(categoria, division).forEach(fila => {
        if (!acc[fila.equipo]) acc[fila.equipo] = { equipo: fila.equipo, pts1ra: 0, pts3ra: 0, pts4ta: 0 };
        acc[fila.equipo][campo] += (fila.pts || 0);
      });
    };
    sumarDivision('Primera', 'pts1ra');
    sumarDivision('3ra', 'pts3ra');
    sumarDivision('4ta', 'pts4ta');
  }
  return Object.values(acc)
    .map(f => ({ ...f, pts: f.pts1ra + f.pts3ra + f.pts4ta }))
    .sort((a, b) => b.pts - a.pts);
}

function sumatoriaTable(rows, kind, equipoMarcado) {
  const wrap = el('div', { class: 'table-scroll' });
  const table = el('table', { class: 'pos-table sumatoria-table' });
  table.appendChild(el('tr', {}, [
    el('th', { text: '#' }),
    el('th', { class: 'col-equipo', text: 'Equipo' }),
    el('th', { text: 'PTS' }),
    el('th', { text: '1RA' }),
    el('th', { text: '3RA' }),
    el('th', { text: '4TA' }),
  ]));
  rows.forEach((r, i) => {
    const marcado = equipoMarcado instanceof Set
      ? equipoMarcado.has(r.equipo)
      : r.equipo === equipoMarcado;
    const cls = equipoMarcado === undefined ? rankBadgeClass(i, rows.length, kind) : (marcado ? kind : '');
    table.appendChild(el('tr', {}, [
      el('td', {}, [el('span', { class: `rank-badge ${cls}`, text: String(i + 1) })]),
      el('td', { class: 'col-equipo' }, [
        el('div', { class: 'team-cell' }, [logoImg(r.equipo), el('span', { text: r.equipo })])
      ]),
      el('td', { class: 'col-pts', text: String(r.pts) }),
      el('td', { text: String(r.pts1ra) }),
      el('td', { text: String(r.pts3ra) }),
      el('td', { text: String(r.pts4ta) }),
    ]));
  });
  wrap.appendChild(table);
  return wrap;
}

function renderPosicionesView(division) {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const etiquetaDivision = division === 'Primera' ? 'Primera' : division;

  ['A', 'B'].forEach(cat => {
    const rows = tablaTorneoActual(cat, division);
    const clasif = clasificadosPlayoff(cat, division);
    const leyenda = [
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'rank-badge playoff' }),
        el('span', { text: 'Puesto de clasificación' }),
      ]),
    ];
    if (clasif.size) {
      leyenda.push(el('span', { class: 'legend-item' }, [
        el('span', { class: 'clasif-badge', text: '\u2713' }),
        el('span', { text: 'Clasificado a play off' }),
      ]));
    }
    const block = el('div', { class: `cat-block cat-block-${cat}` }, [
      el('div', { class: `cat-header cat-${cat}` }, [
        el('span', { text: `Posiciones · ${etiquetaDivision} ${cat}` }),
      ]),
      posTable(rows, 'playoff', clasif),
      el('div', { class: 'legend' }, leyenda),
    ]);
    const llave = llaveSemifinales(cat, division);
    if (llave) block.insertBefore(llave, block.children[1]);
    root.appendChild(block);
  });
}

// El reglamento da dos ascensos: la finalisima entre los campeones de los dos
// torneos, y el primero de esta tabla. Si el que sube por la finalisima es
// ademas el primero de la sumatoria, el cupo pasa al segundo.
function notaAscenso() {
  const camp = (DATA.campeonApertura && DATA.campeonApertura.B) || null;
  const base = camp
    ? `El otro ascenso se define en la finalísima entre ${camp} (campeón del Apertura) y el campeón del Clausura.`
    : 'El otro ascenso se define en la finalísima entre los campeones del Apertura y del Clausura.';
  return base + ' Si el que asciende por esa vía es además el primero de esta tabla, el cupo por sumatoria pasa al segundo.';
}

function renderSumatoriaView() {
  const root = document.getElementById('view-root');
  root.innerHTML = '';

  const sumatoriaA = computeSumatoria('A');
  const sumatoriaB = computeSumatoria('B');
  const descA = computeDescensos('A');

  const anual = el('div', { class: 'anual-block' }, [
    el('div', { class: 'section-label', text: `SUMATORIA GENERAL DE PUNTOS ${DATA.temporada || ''}`.trim() }),
    el('div', { class: 'section-note', text: 'Suma los puntos de Primera, 3ra y 4ta de cada club en los torneos del año.' }),

    el('div', { class: 'anual-cat-header' }, [
      el('span', { class: 'dot dot-A' }), el('span', { text: 'Primera A' }),
    ]),
    sumatoriaTable(sumatoriaA, 'descenso', descA.marcasGeneral),
    el('div', { class: 'legend' }, [
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'rank-badge descenso' }),
        el('span', { text: 'Desciende por tabla general' }),
      ]),
    ]),


    el('div', { class: 'anual-cat-header' }, [
      el('span', { class: 'dot dot-B' }), el('span', { text: 'Primera B' }),
    ]),
    sumatoriaTable(sumatoriaB, 'ascenso', sumatoriaB.length ? sumatoriaB[0].equipo : null),
    el('div', { class: 'legend' }, [
      el('span', { class: 'legend-item' }, [
        el('span', { class: 'rank-badge ascenso' }),
        el('span', { text: 'Asciende por sumatoria general' }),
      ]),
    ]),
    el('div', { class: 'section-note', text: notaAscenso() }),
  ]);
  root.appendChild(anual);
}

// Normaliza un nombre para comparar: sin tildes, sin mayúsculas, sin espacios de más
function normalizarNombre(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// La tabla de goleadores sale de los partidos: se carga el gol una sola vez.
// Nombres equivalentes ("Perez" / "Pérez") se suman juntos y se muestra la grafía más usada.
function computeGoleadores(categoria, division) {
  const acc = {};
  DATA.matches
    .filter(m => m.categoria === categoria && m.division === division && m.estado !== 'suspendido')
    .forEach(m => {
      const agregar = (nombre, club) => {
        if (/\be\/c\b/i.test(nombre)) return; // gol en contra: no suma como goleador
        const key = normalizarNombre(nombre) + '|' + club;
        if (!key.startsWith('|')) {
          if (!acc[key]) acc[key] = { club, goles: 0, grafias: {} };
          acc[key].goles++;
          acc[key].grafias[nombre] = (acc[key].grafias[nombre] || 0) + 1;
        }
      };
      (m.goleadoresLocal || []).forEach(n => agregar(n, m.local));
      (m.goleadoresVisitante || []).forEach(n => agregar(n, m.visitante));
    });
  return Object.values(acc)
    .map(g => ({
      jugador: Object.entries(g.grafias).sort((a, b) => b[1] - a[1])[0][0],
      club: g.club,
      goles: g.goles,
    }))
    .sort((a, b) => b.goles - a.goles || a.jugador.localeCompare(b.jugador));
}

const GOLEADORES_PUESTOS = 5;

function renderGoleadoresView(division) {
  const root = document.getElementById('view-root');
  root.innerHTML = '';
  const etiquetaDivision = division === 'Primera' ? 'Primera' : division;
  ['A', 'B'].forEach(cat => {
    // Si hay una tabla oficial cargada a mano, se respeta. Si no, se calcula desde los partidos.
    const oficial = DATA.goleadores && DATA.goleadores[cat];
    const list = oficial
      ? oficial.filter(g => g.division === division)
      : computeGoleadores(cat, division);
    const inner = [
      el('div', { class: `cat-header cat-${cat}` }, [
        el('span', { text: `Goleadores · ${etiquetaDivision} ${cat}` }),
      ]),
    ];
    if (list.length === 0) {
      inner.push(el('div', { class: 'empty-state', text: 'Todavía no hay goleadores cargados para esta división.' }));
    } else {
      const table = el('table', { class: 'pos-table' });
      table.appendChild(el('tr', {}, [
        el('th', { text: '#' }),
        el('th', { class: 'col-equipo', text: 'Jugador' }),
        el('th', { class: 'col-equipo', text: 'Club' }),
        el('th', { text: 'Goles' }),
      ]));
      const corte = topGoleadores(list, GOLEADORES_PUESTOS).length;
      list.forEach((g, i) => {
        // El numero es el puesto real: los empatados comparten posicion.
        const puesto = 1 + list.filter(o => o.goles > g.goles).length;
        table.appendChild(el('tr', { class: i < corte ? '' : 'gol-oculto' }, [
          el('td', { text: String(puesto) }),
          el('td', { class: 'col-equipo', text: g.jugador }),
          el('td', { class: 'col-equipo' }, [
            el('div', { class: 'club-cell' }, [logoImg(g.club), el('span', { text: g.club })])
          ]),
          el('td', { class: 'col-pts', text: String(g.goles) }),
        ]));
      });
      inner.push(el('div', { class: 'table-scroll' }, [table]));
      if (list.length > corte) {
        const btn = el('button', {
          class: 'ver-todos',
          text: `Ver tabla completa (${list.length} goleadores)`,
          onclick: () => {
            const abierto = table.classList.toggle('mostrar-todos');
            btn.textContent = abierto
              ? 'Ver solo los primeros'
              : `Ver tabla completa (${list.length} goleadores)`;
          },
        });
        inner.push(btn);
      }
    }
    root.appendChild(el('div', { class: `cat-block cat-block-${cat}` }, inner));
  });
}

function render() {
  const chips = document.getElementById('division-chips');
  const sinChips = currentView === 'sumatoria' || currentView === 'anual';
  if (chips) chips.style.display = sinChips ? 'none' : '';
  if (currentView === 'resultados') renderResultadosView(currentDivision);
  else if (currentView === 'posiciones') renderPosicionesView(currentDivision);
  else if (currentView === 'valla') renderVallaView(currentDivision);
  else if (currentView === 'sumatoria') renderSumatoriaView();
  else if (currentView === 'anual') renderAnualView();
  else renderGoleadoresView(currentDivision);
}

function setupToggle() {
  document.querySelectorAll('.view-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.view;
      document.querySelectorAll('.view-toggle button').forEach(b => b.classList.toggle('active', b === btn));
      render();
    });
  });
}

function setupChips() {
  const availableDivisions = new Set(DATA.matches.map(m => m.division));
  const chipsRoot = document.getElementById('division-chips');
  chipsRoot.innerHTML = '';
  DIVISIONS.forEach(div => {
    const has = availableDivisions.has(div) || !!DATA.fixture;
    const chip = el('span', {
      class: `chip ${div === currentDivision ? 'active' : ''} ${has ? '' : 'disabled'}`,
      text: div === 'Primera' ? '1ra' : div,
    });
    if (has) {
      chip.addEventListener('click', () => {
        currentDivision = div;
        currentFecha = null;
        setupChips();
        render();
      });
    }
    chipsRoot.appendChild(chip);
  });
}

document.getElementById('liga-logo').src = IMG.siteLogo;
document.getElementById('torneo-logo').src = IMG.torneoLogo;
document.getElementById('fd-logo-desktop').src = IMG.fdLogo;
document.getElementById('torneo-label').textContent = DATA.torneo || 'Torneo';
document.title = (DATA.torneo ? DATA.torneo + ' · ' : '') + 'Liga Dolorense Hoy';

renderCumpleanos();
renderExtras();
setupMenuToggle();
setupToggle();
setupChips();
render();
