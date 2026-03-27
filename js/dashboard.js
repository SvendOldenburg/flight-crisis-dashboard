/* ============================================
   FLIGHT CRISIS DASHBOARD -- Renderer
   Reads data from window.DASHBOARD_DATA or
   fetches data/status.json, then renders all
   dashboard sections.
   ============================================ */

(function () {
  'use strict';

  // --- Data Loading ---

  function loadData() {
    // Prefer inline data (works on file:// in Chrome)
    if (window.DASHBOARD_DATA) {
      render(window.DASHBOARD_DATA);
      return;
    }
    // Fallback: fetch JSON (works in Firefox file://, and any http server)
    fetch('data/status.json')
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () {
        document.getElementById('riskSummary').textContent =
          'Failed to load dashboard data. Ensure data/status.json or data/status-inline.js exists.';
      });
  }

  // --- Utilities ---

  function statusClass(status) {
    if (!status) return 'unknown';
    var s = status.toLowerCase();
    if (s === 'green' || s === 'stable' || s === 'clear' || s === 'normal') return 'green';
    if (s === 'yellow' || s === 'elevated' || s === 'caution' || s === 'monitor') return 'yellow';
    if (s === 'red' || s === 'high' || s === 'critical' || s === 'danger') return 'red';
    return 'unknown';
  }

  function riskLabelClass(label) {
    if (!label) return 'unknown';
    var l = label.toLowerCase();
    if (l === 'stable') return 'stable';
    if (l === 'elevated') return 'elevated';
    if (l === 'high') return 'high';
    if (l === 'critical') return 'critical';
    return 'unknown';
  }

  function formatDate(dateStr) {
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function formatTimestamp(isoStr) {
    try {
      var d = new Date(isoStr);
      var now = new Date();
      var diff = now - d;
      var mins = Math.floor(diff / 60000);
      var hrs = Math.floor(diff / 3600000);

      var timeStr = d.toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      });

      if (mins < 60) return timeStr + ' (' + mins + 'm ago)';
      if (hrs < 24) return timeStr + ' (' + hrs + 'h ago)';
      return timeStr + ' (' + Math.floor(hrs / 24) + 'd ago)';
    } catch (e) {
      return isoStr;
    }
  }

  function isFresh(isoStr) {
    try {
      return (new Date() - new Date(isoStr)) < 3600000; // within 1 hour
    } catch (e) {
      return false;
    }
  }

  function isSeed(data) {
    return data.fuelOil && data.fuelOil.dataQuality === 'SEED';
  }

  function countdownTo(dateStr) {
    var target = new Date(dateStr + 'T00:00:00+07:00'); // Svo is in GMT+7
    var now = new Date();
    var diff = target - now;
    if (diff <= 0) return { text: 'DEPARTED', days: 0, hours: 0, mins: 0 };
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var mins = Math.floor((diff % 3600000) / 60000);
    return {
      text: days + 'd ' + hours + 'h ' + mins + 'm',
      days: days, hours: hours, mins: mins
    };
  }

  function el(tag, classes, html) {
    var e = document.createElement(tag);
    if (classes) e.className = classes;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function listItems(items, listClass) {
    var ul = el('ul', 'flight-card__list ' + (listClass || ''));
    (items || []).forEach(function (item) {
      var li = el('li', '', item);
      ul.appendChild(li);
    });
    return ul;
  }

  function detailItems(items) {
    var ul = el('ul', 'detail-list');
    (items || []).forEach(function (item) {
      var li = el('li', '', item);
      ul.appendChild(li);
    });
    return ul;
  }

  // --- Render Functions ---

  function renderHeader(data) {
    var updatedEl = document.getElementById('headerUpdated');
    var dotEl = document.getElementById('headerDot');

    updatedEl.textContent = 'Updated: ' + formatTimestamp(data.lastUpdated);

    if (isSeed(data)) {
      dotEl.className = 'header__dot seed';
      updatedEl.className = 'header__updated';
    } else if (isFresh(data.lastUpdated)) {
      dotEl.className = 'header__dot';
      updatedEl.className = 'header__updated fresh';
    } else {
      dotEl.className = 'header__dot stale';
      updatedEl.className = 'header__updated';
    }
  }

  function renderRiskOverview(data) {
    var scoreEl = document.getElementById('riskScore');
    var labelEl = document.getElementById('riskLabel');
    var summaryEl = document.getElementById('riskSummary');
    var ringFill = document.getElementById('riskRingFill');

    var score = data.overallScore || 0;
    var label = data.overallRisk || 'UNKNOWN';
    var cls = riskLabelClass(label);
    var colorClass = statusClass(
      cls === 'stable' ? 'green' :
      cls === 'elevated' ? 'yellow' :
      cls === 'high' || cls === 'critical' ? 'red' : 'unknown'
    );

    scoreEl.textContent = score > 0 ? score.toFixed(1) : '--';
    labelEl.textContent = label;
    labelEl.className = 'risk-overview__label-tag ' + cls;

    // Generate summary from recommendations
    var rec = data.recommendations;
    var summary = rec && rec.overall ? 'Status: ' + rec.overall + '.' : '';
    if (rec && rec.actions && rec.actions.length > 0) {
      summary += ' Top action: ' + rec.actions[0].action;
    }
    summaryEl.textContent = summary || 'Awaiting data.';

    // Animate ring
    var circumference = 326.73; // 2 * PI * 52
    var pct = Math.min(score / 10, 1);
    var offset = circumference * (1 - pct);
    ringFill.style.strokeDashoffset = offset;

    // Color the ring
    var colors = { green: '#00e676', yellow: '#ffc400', red: '#ff1744', unknown: '#448aff' };
    ringFill.setAttribute('stroke', colors[colorClass] || colors.unknown);
  }

  function renderFlights(data) {
    var grid = document.getElementById('flightsGrid');
    grid.innerHTML = '';

    (data.flights || []).forEach(function (flight) {
      var cls = statusClass(flight.status);
      var card = el('div', 'panel flight-card ' + cls);

      // Header
      var header = el('div', 'flight-card__header');
      header.appendChild(el('span', 'flight-card__airline', flight.airline));
      var statusBadge = el('span', 'flight-card__status ' + cls, flight.status || 'UNKNOWN');
      header.appendChild(statusBadge);
      card.appendChild(header);

      // Route + date
      card.appendChild(el('div', 'flight-card__route', flight.route));
      card.appendChild(el('div', 'flight-card__date', formatDate(flight.date)));

      // Countdown
      var cd = countdownTo(flight.date);
      var cdEl = el('div', 'flight-card__countdown', cd.text);
      cdEl.setAttribute('data-date', flight.date);
      card.appendChild(cdEl);
      card.appendChild(el('div', 'flight-card__countdown-label', 'until departure'));

      // Risk bar
      var riskBar = el('div', 'flight-card__risk-bar');
      riskBar.appendChild(el('span', 'flight-card__risk-score', (flight.riskScore || 0) + '/10'));
      var track = el('div', 'flight-card__risk-track');
      var fill = el('div', 'flight-card__risk-fill ' + cls);
      fill.style.width = ((flight.riskScore || 0) * 10) + '%';
      track.appendChild(fill);
      riskBar.appendChild(track);
      card.appendChild(riskBar);

      // Risks
      if (flight.risks && flight.risks.length) {
        card.appendChild(el('div', 'flight-card__section-title', 'Risks'));
        card.appendChild(listItems(flight.risks, 'risks'));
      }

      // Mitigations
      if (flight.mitigations && flight.mitigations.length) {
        card.appendChild(el('div', 'flight-card__section-title', 'Mitigations'));
        card.appendChild(listItems(flight.mitigations, 'mitigations'));
      }

      grid.appendChild(card);
    });
  }

  function renderFuel(data) {
    var container = document.getElementById('fuelContent');
    container.innerHTML = '';
    var fuel = data.fuelOil;
    if (!fuel) { container.innerHTML = '<p class="fuel-summary">No fuel data.</p>'; return; }

    if (fuel.dataQuality === 'SEED') {
      var warn = el('div', 'data-quality-warning', 'Seed data. Run /refresh-flights for live numbers.');
      container.appendChild(warn);
    }

    // Stats row
    var stats = el('div', 'fuel-stats');

    // Brent
    if (fuel.brentCrude > 0) {
      var brent = el('div', 'fuel-stat');
      brent.appendChild(el('span', 'fuel-stat__value', '$' + fuel.brentCrude.toFixed(2)));
      var changeClass = fuel.brentChange && fuel.brentChange.startsWith('+') ? 'up'
        : fuel.brentChange && fuel.brentChange.startsWith('-') ? 'down' : 'neutral';
      brent.appendChild(el('span', 'fuel-stat__change ' + changeClass, fuel.brentChange || ''));
      brent.appendChild(el('span', 'fuel-stat__label', 'Brent Crude'));
      stats.appendChild(brent);
    }

    // Jet fuel
    if (fuel.jetFuelIndex > 0) {
      var jet = el('div', 'fuel-stat');
      jet.appendChild(el('span', 'fuel-stat__value', fuel.jetFuelIndex.toFixed(1)));
      var jChangeClass = fuel.jetFuelChange && fuel.jetFuelChange.startsWith('+') ? 'up'
        : fuel.jetFuelChange && fuel.jetFuelChange.startsWith('-') ? 'down' : 'neutral';
      jet.appendChild(el('span', 'fuel-stat__change ' + jChangeClass, fuel.jetFuelChange || ''));
      jet.appendChild(el('span', 'fuel-stat__label', 'Jet Fuel Index'));
      stats.appendChild(jet);
    }

    // Budget airline impact
    var impact = el('div', 'fuel-stat');
    impact.appendChild(el('span', 'fuel-stat__label', 'Budget Airline Impact'));
    var impactBadge = el('span', 'badge ' + statusClass(fuel.impactOnBudgetAirlines), fuel.impactOnBudgetAirlines || 'N/A');
    impact.appendChild(impactBadge);
    stats.appendChild(impact);

    container.appendChild(stats);

    // Summary
    if (fuel.summary) {
      container.appendChild(el('p', 'fuel-summary', fuel.summary));
    }

    // Details
    if (fuel.details && fuel.details.length) {
      container.appendChild(detailItems(fuel.details));
    }
  }

  function renderGeo(data) {
    var container = document.getElementById('geoContent');
    container.innerHTML = '';
    var geo = data.geopolitical;
    if (!geo) { container.innerHTML = '<p class="geo-item__text">No data.</p>'; return; }

    if (geo.dataQuality === 'SEED') {
      container.appendChild(el('div', 'data-quality-warning', 'Seed data. Run /refresh-flights for live intel.'));
    }

    // Threat level
    var threat = el('div', 'geo-threat');
    threat.appendChild(el('span', 'geo-threat__label', 'Threat Level'));
    threat.appendChild(el('span', 'badge ' + statusClass(geo.threatLevel), geo.threatLevel || 'UNKNOWN'));
    container.appendChild(threat);

    // Iran
    if (geo.iranConflict) {
      var iran = el('div', 'geo-item');
      iran.appendChild(el('div', 'geo-item__title', 'Iran Conflict'));
      iran.appendChild(el('p', 'geo-item__text', geo.iranConflict));
      container.appendChild(iran);
    }

    // Airspace closures
    if (geo.airspaceClosures && geo.airspaceClosures.length) {
      var asItem = el('div', 'geo-item');
      asItem.appendChild(el('div', 'geo-item__title', 'Airspace Closures'));
      var asList = el('ul', 'airspace-list');
      geo.airspaceClosures.forEach(function (c) {
        asList.appendChild(el('li', '', c));
      });
      asItem.appendChild(asList);
      container.appendChild(asItem);
    }

    // Regional stability
    if (geo.regionalStability) {
      var reg = el('div', 'geo-item');
      reg.appendChild(el('div', 'geo-item__title', 'Regional Stability'));
      reg.appendChild(el('p', 'geo-item__text', geo.regionalStability));
      container.appendChild(reg);
    }

    // Details
    if (geo.details && geo.details.length) {
      container.appendChild(detailItems(geo.details));
    }
  }

  function renderRoutes(data) {
    var container = document.getElementById('routeContent');
    container.innerHTML = '';
    var routes = data.routeRisk;
    if (!routes) { container.innerHTML = '<p class="route-item__notes">No data.</p>'; return; }

    var routeMap = [
      { key: 'cxrToDmk', codes: 'CXR to DMK', label: 'Nha Trang to Bangkok' },
      { key: 'bkkToCph', codes: 'BKK to CPH', label: 'Bangkok to Copenhagen' }
    ];

    routeMap.forEach(function (r) {
      var rd = routes[r.key];
      if (!rd) return;

      var item = el('div', 'route-item');
      var header = el('div', 'route-item__header');
      header.appendChild(el('span', 'route-item__codes', r.codes));
      var statusStr = rd.airspaceStatus || 'UNKNOWN';
      var cls = statusStr === 'CLEAR' ? 'green'
        : statusStr.indexOf('REROUTING') >= 0 ? 'yellow'
        : statusStr === 'CLOSED' ? 'red' : 'unknown';
      header.appendChild(el('span', 'badge ' + cls, statusStr));
      item.appendChild(header);

      if (rd.rerouting) {
        item.appendChild(el('p', 'route-item__notes', 'Rerouting may be required.'));
      }
      if (rd.notes) {
        item.appendChild(el('p', 'route-item__notes', rd.notes));
      }
      container.appendChild(item);
    });
  }

  function renderAirlines(data) {
    var grid = document.getElementById('airlineGrid');
    grid.innerHTML = '';
    var ah = data.airlineHealth;
    if (!ah) return;

    var airlines = [
      { key: 'airasia', name: 'AirAsia' },
      { key: 'thaiAirways', name: 'Thai Airways' }
    ];

    airlines.forEach(function (a) {
      var ad = ah[a.key];
      if (!ad) return;

      var card = el('div', 'airline-card');
      var header = el('div', 'airline-card__header');
      header.appendChild(el('span', 'airline-card__name', a.name));
      header.appendChild(el('span', 'badge ' + statusClass(ad.status), ad.status || 'UNKNOWN'));
      card.appendChild(header);

      var fields = [
        { label: 'Cancellation Rate', value: ad.cancellationRate },
        { label: 'Financial Health', value: ad.financialHealth },
        { label: 'Recent Disruptions', value: ad.recentDisruptions }
      ];

      fields.forEach(function (f) {
        if (!f.value) return;
        var stat = el('div', 'airline-stat');
        stat.appendChild(el('div', 'airline-stat__label', f.label));
        stat.appendChild(el('div', 'airline-stat__value', f.value));
        card.appendChild(stat);
      });

      grid.appendChild(card);
    });
  }

  function renderRecommendations(data) {
    var container = document.getElementById('recContent');
    container.innerHTML = '';
    var rec = data.recommendations;
    if (!rec || !rec.actions || !rec.actions.length) {
      container.innerHTML = '<p class="fuel-summary">No recommendations yet.</p>';
      return;
    }

    var list = el('ol', 'rec-list');
    rec.actions.forEach(function (a) {
      var item = el('li', 'rec-item');
      var cls = (a.priority || '').toLowerCase() === 'high' ? 'red'
        : (a.priority || '').toLowerCase() === 'medium' ? 'yellow' : 'green';
      item.appendChild(el('span', 'rec-item__priority badge ' + cls, a.priority || 'INFO'));

      var body = el('div', 'rec-item__body');
      body.appendChild(el('div', 'rec-item__action', a.action));
      if (a.deadline) {
        body.appendChild(el('div', 'rec-item__deadline', 'Deadline: ' + a.deadline));
      }
      item.appendChild(body);
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  // --- New Sections ---

  function renderOilTimeline(data) {
    var container = document.getElementById('oilTimelineContent');
    if (!container) return;
    container.innerHTML = '';
    var timeline = data.oilPriceTimeline;
    if (!timeline || !timeline.length) {
      container.innerHTML = '<p class="fuel-summary">No timeline data available.</p>';
      return;
    }

    var table = el('table', 'timeline-table');
    var thead = el('thead', '');
    var headRow = el('tr', '');
    headRow.appendChild(el('th', '', 'Date'));
    headRow.appendChild(el('th', '', 'Brent'));
    headRow.appendChild(el('th', '', 'Jet Fuel'));
    headRow.appendChild(el('th', '', 'Event'));
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = el('tbody', '');
    timeline.forEach(function (row) {
      var tr = el('tr', row.highlight || '');
      tr.appendChild(el('td', 'date-col', row.date));
      tr.appendChild(el('td', 'value-col', row.brent || '--'));
      tr.appendChild(el('td', 'value-col', row.jetFuel || '--'));
      tr.appendChild(el('td', 'event-col', row.event || ''));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function renderCancellationTimeline(data) {
    var container = document.getElementById('cancellationTimelineContent');
    if (!container) return;
    container.innerHTML = '';
    var timeline = data.cancellationTimeline;
    if (!timeline || !timeline.length) {
      container.innerHTML = '<p class="fuel-summary">No disruption timeline available.</p>';
      return;
    }

    var table = el('table', 'timeline-table');
    var thead = el('thead', '');
    var headRow = el('tr', '');
    headRow.appendChild(el('th', '', 'Date'));
    headRow.appendChild(el('th', '', 'Disruptions'));
    headRow.appendChild(el('th', '', 'Details'));
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = el('tbody', '');
    timeline.forEach(function (row) {
      var tr = el('tr', row.highlight || '');
      tr.appendChild(el('td', 'date-col', row.date));
      tr.appendChild(el('td', 'value-col', row.count || '--'));
      tr.appendChild(el('td', 'event-col', row.details || ''));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  function renderSeaAirlines(data) {
    var container = document.getElementById('seaAirlineContent');
    if (!container) return;
    container.innerHTML = '';
    var airlines = data.seaAirlineOverview;
    if (!airlines || !airlines.length) {
      container.innerHTML = '<p class="fuel-summary">No airline overview available.</p>';
      return;
    }

    if (data.seaAirlineSummary) {
      container.appendChild(el('p', 'context-narrative', data.seaAirlineSummary));
    }

    var grid = el('div', 'sea-airline-grid');
    airlines.forEach(function (a) {
      var card = el('div', 'sea-airline-card ' + (a.type || ''));

      var header = el('div', 'sea-airline-card__header');
      header.appendChild(el('span', 'sea-airline-card__name', a.name));
      var badges = el('span', '');
      if (a.status) {
        badges.appendChild(el('span', 'badge ' + statusClass(a.status), a.status));
      }
      header.appendChild(badges);
      card.appendChild(header);

      card.appendChild(el('span', 'sea-airline-card__type', (a.type || '') + ' carrier'));

      if (a.impact) {
        card.appendChild(el('p', 'sea-airline-card__impact', a.impact));
      }
      if (a.detail) {
        card.appendChild(el('p', 'sea-airline-card__detail', a.detail));
      }

      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  function renderBroaderContext(data) {
    var container = document.getElementById('broaderContextContent');
    if (!container) return;
    container.innerHTML = '';
    var ctx = data.broaderContext;
    if (!ctx) {
      container.innerHTML = '<p class="fuel-summary">No broader context available.</p>';
      return;
    }

    if (ctx.narrative) {
      container.appendChild(el('p', 'context-narrative', ctx.narrative));
    }

    if (ctx.policies && ctx.policies.length) {
      var grid = el('div', 'context-grid');
      ctx.policies.forEach(function (p) {
        var item = el('div', 'context-item');
        var header = el('div', 'context-item__country');
        header.appendChild(document.createTextNode(p.country || ''));
        if (p.date) {
          header.appendChild(el('span', 'context-item__date', p.date));
        }
        item.appendChild(header);
        item.appendChild(el('p', 'context-item__text', p.description || ''));
        grid.appendChild(item);
      });
      container.appendChild(grid);
    }

    if (ctx.outlook) {
      container.appendChild(el('p', 'fuel-summary', '<strong>Outlook:</strong> ' + ctx.outlook));
    }
  }

  // --- Flight Search Engine ---

  // Airport country mapping for risk assessment
  var AIRPORT_COUNTRIES = {
    // Vietnam
    CXR: 'VN', SGN: 'VN', HAN: 'VN', DAD: 'VN', PQC: 'VN', VDO: 'VN', HPH: 'VN',
    // Thailand
    BKK: 'TH', DMK: 'TH', HKT: 'TH', CNX: 'TH', USM: 'TH', KBV: 'TH', CEI: 'TH',
    // Philippines
    MNL: 'PH', CEB: 'PH', DVO: 'PH', CRK: 'PH', ILO: 'PH',
    // Indonesia
    CGK: 'ID', DPS: 'ID', SUB: 'ID', UPG: 'ID', JOG: 'ID',
    // Malaysia
    KUL: 'MY', PEN: 'MY', BKI: 'MY', KCH: 'MY', LGK: 'MY',
    // Singapore
    SIN: 'SG',
    // Cambodia
    PNH: 'KH', REP: 'KH',
    // Myanmar
    RGN: 'MM', MDL: 'MM',
    // Laos
    VTE: 'LA', LPQ: 'LA',
    // Europe
    CPH: 'EU', LHR: 'EU', CDG: 'EU', FRA: 'EU', AMS: 'EU', HEL: 'EU', ARN: 'EU',
    IST: 'EU', FCO: 'EU', BCN: 'EU', MUC: 'EU', ZRH: 'EU', OSL: 'EU', BER: 'EU',
    VIE: 'EU', WAW: 'EU', PRG: 'EU', ATH: 'EU',
    // Middle East
    DXB: 'ME', DOH: 'ME', AUH: 'ME', BAH: 'ME', KWI: 'ME', RUH: 'ME', JED: 'ME',
    // East Asia
    NRT: 'JP', HND: 'JP', KIX: 'JP', ICN: 'KR', HKG: 'HK', TPE: 'TW',
    PEK: 'CN', PVG: 'CN', CAN: 'CN',
    // South Asia
    DEL: 'IN', BOM: 'IN', CCU: 'IN', CMB: 'LK',
    // Oceania
    SYD: 'AU', MEL: 'AU', BNE: 'AU', AKL: 'NZ'
  };

  // Countries with fuel supply issues
  var FUEL_CRISIS_COUNTRIES = ['VN', 'PH', 'MM'];
  var FUEL_RESTRICTED_COUNTRIES = ['TH', 'ID', 'MY'];

  // Airline knowledge base
  var AIRLINE_DB = {
    airasia: { name: 'AirAsia', type: 'budget', riskMod: 2 },
    thaiairways: { name: 'Thai Airways', type: 'flag', riskMod: -1 },
    vietnamairlines: { name: 'Vietnam Airlines', type: 'flag', riskMod: 1 },
    vietjet: { name: 'VietJet Air', type: 'budget', riskMod: 2 },
    cebu: { name: 'Cebu Pacific', type: 'budget', riskMod: 3 },
    bangkokairways: { name: 'Bangkok Airways', type: 'flag', riskMod: 0 },
    nokair: { name: 'Nok Air', type: 'budget', riskMod: 1 },
    lionair: { name: 'Lion Air', type: 'budget', riskMod: 2 },
    'other-budget': { name: 'Budget carrier', type: 'budget', riskMod: 2 },
    'other-flag': { name: 'Flag carrier', type: 'flag', riskMod: 0 }
  };

  function assessFlightRisk(origin, dest, airlineKey, date, data) {
    var factors = [];
    var baseScore = 4; // Start at moderate baseline given the global situation

    var originCountry = AIRPORT_COUNTRIES[origin] || 'UNKNOWN';
    var destCountry = AIRPORT_COUNTRIES[dest] || 'UNKNOWN';
    var airline = airlineKey ? AIRLINE_DB[airlineKey] : null;

    // Factor 1: Fuel situation at origin
    if (FUEL_CRISIS_COUNTRIES.indexOf(originCountry) >= 0) {
      baseScore += 2;
      factors.push({
        label: 'Origin Fuel Supply',
        value: 'CRITICAL. ' + origin + ' is in a country facing severe jet fuel shortages. China and Thailand have halted fuel exports to this region.',
        severity: 'red'
      });
    } else if (FUEL_RESTRICTED_COUNTRIES.indexOf(originCountry) >= 0) {
      baseScore += 1;
      factors.push({
        label: 'Origin Fuel Supply',
        value: 'RESTRICTED. ' + origin + ' is in a country with fuel export bans and domestic rationing measures, but domestic aviation fuel still available.',
        severity: 'yellow'
      });
    } else {
      factors.push({
        label: 'Origin Fuel Supply',
        value: 'No direct fuel supply crisis reported for ' + origin + '. Global fuel prices still elevated.',
        severity: 'green'
      });
    }

    // Factor 2: Route type (domestic SEA vs long-haul vs Middle East transit)
    var crossesME = false;
    var isLongHaul = false;
    var seaToEurope = false;

    if ((originCountry === 'EU' && ['TH','VN','SG','MY','ID','PH','KH','MM','LA','JP','KR','HK','TW','CN','IN','LK','AU','NZ'].indexOf(destCountry) >= 0) ||
        (destCountry === 'EU' && ['TH','VN','SG','MY','ID','PH','KH','MM','LA','JP','KR','HK','TW','CN','IN','LK','AU','NZ'].indexOf(originCountry) >= 0)) {
      seaToEurope = true;
      isLongHaul = true;
      crossesME = true;
      baseScore += 1;
      factors.push({
        label: 'Route Airspace',
        value: 'Long-haul route between Asia and Europe. Traditional Gulf corridor unavailable due to Iran/Iraq/Kuwait/Syria airspace closures. Rerouting adds 90min to 3hrs. Northern (Caucasus) or southern (Egypt-Oman) corridors in use.',
        severity: 'yellow'
      });
    } else if (originCountry === 'ME' || destCountry === 'ME') {
      crossesME = true;
      baseScore += 3;
      factors.push({
        label: 'Route Airspace',
        value: 'DANGER. Route involves Middle East airports. Multiple FIRs closed (Iran, Iraq, Kuwait, Syria). UAE/Qatar/Bahrain heavily restricted with short-notice closures possible. High cancellation risk.',
        severity: 'red'
      });
    } else {
      var seaCountries = ['TH','VN','SG','MY','ID','PH','KH','MM','LA'];
      if (seaCountries.indexOf(originCountry) >= 0 && seaCountries.indexOf(destCountry) >= 0) {
        factors.push({
          label: 'Route Airspace',
          value: 'Intra-SEA route. Airspace completely unaffected by Middle East closures. Primary risk is fuel supply, not airspace.',
          severity: 'green'
        });
      } else {
        factors.push({
          label: 'Route Airspace',
          value: 'Route does not cross directly affected Middle East airspace, but global rerouting congestion may cause indirect delays.',
          severity: 'green'
        });
      }
    }

    // Factor 3: Airline type
    if (airline) {
      baseScore += airline.riskMod;
      if (airline.type === 'budget') {
        factors.push({
          label: 'Airline Risk',
          value: airline.name + ' is a budget carrier. Budget airlines are most exposed: thin margins, limited fuel hedging, 40-60% fuel cost spike directly threatens operations. Higher cancellation risk.',
          severity: 'yellow'
        });
      } else {
        factors.push({
          label: 'Airline Risk',
          value: airline.name + ' is a flag/full-service carrier. Generally more resilient: government backing, fuel hedging programs, able to absorb cost increases via fare hikes. Lower cancellation risk.',
          severity: 'green'
        });
      }

      // Check if we have specific data for this airline
      var overview = data.seaAirlineOverview || [];
      var match = overview.find(function (a) {
        return a.name.toLowerCase().indexOf(airline.name.toLowerCase().split(' ')[0]) >= 0;
      });
      if (match) {
        factors.push({
          label: 'Airline Intel',
          value: match.impact,
          severity: statusClass(match.status)
        });
      }
    } else {
      factors.push({
        label: 'Airline Risk',
        value: 'No airline specified. Budget carriers face significantly higher risk than flag carriers in the current fuel crisis. If flying budget, add +2 to this score mentally.',
        severity: 'yellow'
      });
    }

    // Factor 4: Overall fuel/geopolitical situation (from dashboard data)
    var fuelScore = 0;
    if (data.fuelOil && data.fuelOil.brentCrude > 0) {
      if (data.fuelOil.brentCrude > 110) fuelScore = 2;
      else if (data.fuelOil.brentCrude > 90) fuelScore = 1;
      factors.push({
        label: 'Global Fuel',
        value: 'Brent crude at $' + data.fuelOil.brentCrude.toFixed(2) + '/bbl (' + (data.fuelOil.brentChange || '') + '). Jet fuel at $' + (data.fuelOil.jetFuelIndex || 0).toFixed(0) + '/bbl. ' + (data.fuelOil.summary || ''),
        severity: data.fuelOil.brentCrude > 100 ? 'yellow' : 'green'
      });
    }
    baseScore += fuelScore;

    // Factor 5: Timing
    if (date) {
      var cd = countdownTo(date);
      if (cd.days <= 7) {
        factors.push({
          label: 'Timing',
          value: cd.days + ' days until departure. Very limited time to find alternatives if cancelled. Check booking status immediately.',
          severity: 'red'
        });
        baseScore += 1;
      } else if (cd.days <= 21) {
        factors.push({
          label: 'Timing',
          value: cd.days + ' days until departure. Some buffer to monitor and pivot, but start identifying backup options now.',
          severity: 'yellow'
        });
      } else {
        factors.push({
          label: 'Timing',
          value: cd.days + ' days until departure. Good buffer. Monitor weekly and book alternatives if situation worsens.',
          severity: 'green'
        });
      }
    }

    // Clamp score
    var score = Math.max(1, Math.min(10, baseScore));
    var status = score <= 3 ? 'GREEN' : score <= 7 ? 'YELLOW' : 'RED';

    return { score: score, status: status, factors: factors, crossesME: crossesME, isLongHaul: isLongHaul };
  }

  var _dashboardData = null;

  function initSearch(data) {
    _dashboardData = data;
    var form = document.getElementById('searchForm');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var origin = document.getElementById('searchOrigin').value.trim().toUpperCase();
      var dest = document.getElementById('searchDest').value.trim().toUpperCase();
      var airlineKey = document.getElementById('searchAirline').value;
      var date = document.getElementById('searchDate').value;

      if (!origin || !dest) return;
      if (origin.length < 3 || dest.length < 3) return;

      var result = assessFlightRisk(origin, dest, airlineKey, date, _dashboardData);
      renderSearchResult(origin, dest, airlineKey, date, result);
    });
  }

  function renderSearchResult(origin, dest, airlineKey, date, result) {
    var container = document.getElementById('searchResult');
    container.innerHTML = '';
    container.style.display = 'block';

    // Header
    var header = el('div', 'search-result__header');
    var airline = airlineKey ? AIRLINE_DB[airlineKey] : null;
    var routeText = origin + ' &#8594; ' + dest;
    if (airline) routeText = airline.name + ': ' + routeText;
    header.appendChild(el('span', 'search-result__route', routeText));
    var closeBtn = el('button', 'search-result__close', 'Clear');
    closeBtn.addEventListener('click', function () {
      container.style.display = 'none';
      container.innerHTML = '';
    });
    header.appendChild(closeBtn);
    container.appendChild(header);

    // Score
    var scoreRow = el('div', 'search-result__score-row');
    var cls = statusClass(result.status);
    scoreRow.appendChild(el('span', 'search-result__score ' + cls, result.score + '/10'));
    var labelArea = el('div', '');
    labelArea.appendChild(el('span', 'badge ' + cls, result.status));
    labelArea.appendChild(el('div', 'search-result__score-label',
      result.score <= 3 ? 'Low risk. Fly with reasonable confidence.' :
      result.score <= 5 ? 'Moderate risk. Monitor situation.' :
      result.score <= 7 ? 'Elevated risk. Have backup plans ready.' :
      'High risk. Seriously consider alternatives.'));
    scoreRow.appendChild(labelArea);
    container.appendChild(scoreRow);

    // Date + countdown
    if (date) {
      var cd = countdownTo(date);
      container.appendChild(el('p', 'fuel-summary',
        formatDate(date) + ' (' + cd.text + ' from now)'));
    }

    // Factors grid
    var grid = el('div', 'search-result__factors');
    result.factors.forEach(function (f) {
      var factor = el('div', 'search-result__factor');
      var labelRow = el('div', 'search-result__factor-label');
      labelRow.appendChild(document.createTextNode(f.label + ' '));
      labelRow.appendChild(el('span', 'badge ' + (f.severity || 'unknown'),
        f.severity === 'red' ? 'HIGH' : f.severity === 'yellow' ? 'MODERATE' : 'LOW'));
      factor.appendChild(labelRow);
      factor.appendChild(el('div', 'search-result__factor-value', f.value));
      grid.appendChild(factor);
    });
    container.appendChild(grid);

    // Disclaimer
    container.appendChild(el('p', 'search-result__disclaimer',
      'Risk assessment based on current dashboard data (last updated: ' +
      formatTimestamp(_dashboardData.lastUpdated) +
      '). This is an estimate, not a guarantee. Verify with your airline directly.'));

    // Scroll into view
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // --- Countdown Ticker ---

  function tickCountdowns() {
    var cdEls = document.querySelectorAll('.flight-card__countdown[data-date]');
    cdEls.forEach(function (cdEl) {
      var cd = countdownTo(cdEl.getAttribute('data-date'));
      cdEl.textContent = cd.text;
    });
  }

  // --- Main Render ---

  function render(data) {
    renderHeader(data);
    renderRiskOverview(data);
    renderFlights(data);
    renderFuel(data);
    renderGeo(data);
    renderRoutes(data);
    renderAirlines(data);
    renderRecommendations(data);
    renderOilTimeline(data);
    renderCancellationTimeline(data);
    renderSeaAirlines(data);
    renderBroaderContext(data);
    initSearch(data);

    // Tick countdowns every 60s
    setInterval(tickCountdowns, 60000);
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', loadData);

})();
