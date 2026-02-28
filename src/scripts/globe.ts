(function () {
  "use strict";

  interface TrafficCountry {
    code: string;
    lat: number;
    lng: number;
    requests: number;
  }

  interface TrafficColo {
    code: string;
    lat: number;
    lng: number;
    requests: number;
  }

  interface TrafficData {
    updatedAt: string;
    totalRequests: number;
    windowHours: number;
    topCountries: TrafficCountry[];
    edgeColos: TrafficColo[];
  }

  interface Arc {
    id: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    weight: number;
    dashGap: number;
  }

  // Dedicated origin servers
  var ORIGINS = [
    { lat: 45.31, lng: -73.87, label: "OVH BHS" },
    { lat: 60.17, lng: 24.94, label: "Hetzner HEL" },
    { lat: 34.05, lng: -118.24, label: "Vercel US" },
  ];

  var TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

  // Country code → display name
  var COUNTRY_NAMES: Record<string, string> = {
    US: "United States",
    CA: "Canada",
    MX: "Mexico",
    BR: "Brazil",
    AR: "Argentina",
    CL: "Chile",
    CO: "Colombia",
    PE: "Peru",
    VE: "Venezuela",
    EC: "Ecuador",
    UY: "Uruguay",
    PY: "Paraguay",
    BO: "Bolivia",
    CR: "Costa Rica",
    DO: "Dominican Republic",
    JM: "Jamaica",
    PR: "Puerto Rico",
    CU: "Cuba",
    HN: "Honduras",
    NI: "Nicaragua",
    PA: "Panama",
    GT: "Guatemala",
    SV: "El Salvador",
    TT: "Trinidad & Tobago",
    BZ: "Belize",
    HT: "Haiti",
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    NL: "Netherlands",
    ES: "Spain",
    IT: "Italy",
    SE: "Sweden",
    NO: "Norway",
    FI: "Finland",
    DK: "Denmark",
    PL: "Poland",
    AT: "Austria",
    CH: "Switzerland",
    BE: "Belgium",
    PT: "Portugal",
    IE: "Ireland",
    CZ: "Czechia",
    RO: "Romania",
    HU: "Hungary",
    GR: "Greece",
    UA: "Ukraine",
    RU: "Russia",
    SK: "Slovakia",
    BG: "Bulgaria",
    RS: "Serbia",
    HR: "Croatia",
    SI: "Slovenia",
    LT: "Lithuania",
    LV: "Latvia",
    EE: "Estonia",
    BA: "Bosnia",
    MK: "North Macedonia",
    AL: "Albania",
    LU: "Luxembourg",
    MT: "Malta",
    CY: "Cyprus",
    MD: "Moldova",
    BY: "Belarus",
    AD: "Andorra",
    GI: "Gibraltar",
    TR: "Turkey",
    AE: "UAE",
    SA: "Saudi Arabia",
    IL: "Israel",
    IR: "Iran",
    IQ: "Iraq",
    JO: "Jordan",
    LB: "Lebanon",
    QA: "Qatar",
    KW: "Kuwait",
    BH: "Bahrain",
    PS: "Palestine",
    JP: "Japan",
    KR: "South Korea",
    CN: "China",
    IN: "India",
    ID: "Indonesia",
    TH: "Thailand",
    VN: "Vietnam",
    PH: "Philippines",
    MY: "Malaysia",
    SG: "Singapore",
    TW: "Taiwan",
    HK: "Hong Kong",
    AU: "Australia",
    NZ: "New Zealand",
    PK: "Pakistan",
    BD: "Bangladesh",
    LK: "Sri Lanka",
    NP: "Nepal",
    KH: "Cambodia",
    KZ: "Kazakhstan",
    KG: "Kyrgyzstan",
    UZ: "Uzbekistan",
    MN: "Mongolia",
    MV: "Maldives",
    GE: "Georgia",
    AZ: "Azerbaijan",
    MM: "Myanmar",
    LA: "Laos",
    ZA: "South Africa",
    NG: "Nigeria",
    KE: "Kenya",
    EG: "Egypt",
    MA: "Morocco",
    DZ: "Algeria",
    TN: "Tunisia",
    ET: "Ethiopia",
    UG: "Uganda",
    GH: "Ghana",
    TZ: "Tanzania",
    SN: "Senegal",
    CM: "Cameroon",
    CI: "Côte d'Ivoire",
    MG: "Madagascar",
    MU: "Mauritius",
    RW: "Rwanda",
    ZW: "Zimbabwe",
    MW: "Malawi",
    MZ: "Mozambique",
    AO: "Angola",
    ZM: "Zambia",
    BW: "Botswana",
    NA: "Namibia",
    CD: "DR Congo",
    LY: "Libya",
    SD: "Sudan",
    BB: "Barbados",
    BS: "Bahamas",
    CW: "Curaçao",
    AW: "Aruba",
    KY: "Cayman Islands",
    BM: "Bermuda",
    BN: "Brunei",
    TJ: "Tajikistan",
    TM: "Turkmenistan",
    AF: "Afghanistan",
    OM: "Oman",
    YE: "Yemen",
    SY: "Syria",
    AM: "Armenia",
    FJ: "Fiji",
    PG: "Papua New Guinea",
    ME: "Montenegro",
    XK: "Kosovo",
    IS: "Iceland",
  };

  var isDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

  function getColors() {
    return {
      globe: isDark ? "#0f172a" : "#dbeafe",
      land: isDark ? "#1e293b" : "#bbf7d0",
      landStroke: isDark ? "#334155" : "#86efac",
      atmosphere: isDark ? "#3b82f6" : "#2563eb",
      arc: isDark ? "#fb923c" : "#c2410c",
      arcAlt: isDark ? "#fde68a" : "#ea580c",
      point: isDark ? "#fb923c" : "#c2410c",
      origin: isDark ? "#22d3ee" : "#0891b2",
    };
  }

  function hexToRgb(hex: string) {
    var h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16) / 255,
      g: parseInt(h.substring(2, 4), 16) / 255,
      b: parseInt(h.substring(4, 6), 16) / 255,
    };
  }

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toString();
  }

  function populateStats(data: TrafficData) {
    var el = document.getElementById("net-total");
    if (el) el.textContent = formatNumber(data.totalRequests);

    el = document.getElementById("net-rps");
    if (el) {
      var rps = data.totalRequests / (data.windowHours * 3600);
      el.textContent = rps < 1 ? rps.toFixed(2) : Math.round(rps).toLocaleString();
    }

    // Populate country list
    var listEl = document.querySelector(".network-countries-list");
    if (listEl) {
      var html = "";
      for (var i = 0; i < data.topCountries.length; i++) {
        var c = data.topCountries[i]!;
        var name = COUNTRY_NAMES[c.code] || c.code;
        html +=
          '<div class="network-country-row">' +
          '<span class="network-country-name">' +
          name +
          "</span>" +
          '<span class="network-country-count">' +
          formatNumber(c.requests) +
          "</span>" +
          "</div>";
      }
      listEl.innerHTML = html;
    }
  }

  function nearestOrigin(lat: number, lng: number) {
    var best = ORIGINS[0]!;
    var bestDist = Infinity;
    for (var i = 0; i < ORIGINS.length; i++) {
      var o = ORIGINS[i]!;
      var dlat = o.lat - lat;
      var dlng = o.lng - lng;
      var dist = dlat * dlat + dlng * dlng;
      if (dist < bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    return best;
  }

  // Jitter radius (degrees) per country — larger countries get more spread
  var JITTER: Record<string, number> = {
    US: 8,
    CA: 7,
    RU: 12,
    CN: 8,
    AU: 7,
    BR: 7,
    IN: 5,
    MX: 4,
    AR: 5,
    DE: 2,
    FR: 2.5,
    GB: 1.5,
    JP: 2,
    ID: 4,
    SE: 3,
    NO: 3,
    FI: 3,
    PL: 2,
    ES: 2,
    IT: 2,
  };
  var DEFAULT_JITTER = 1.5;

  /** Random offset within a circle of given radius */
  function jitter(lat: number, lng: number, radius: number): [number, number] {
    var angle = Math.random() * Math.PI * 2;
    var r = Math.sqrt(Math.random()) * radius; // sqrt for uniform distribution within circle
    return [lat + r * Math.sin(angle), lng + r * Math.cos(angle)];
  }

  var arcIdCounter = 0;

  function makeArc(slat: number, slng: number, elat: number, elng: number, weight: number): Arc {
    return {
      id: "a" + arcIdCounter++,
      startLat: slat,
      startLng: slng,
      endLat: elat,
      endLng: elng,
      weight: weight,
      dashGap: Math.random() * 2,
    };
  }

  interface ArcSource {
    code: string;
    lat: number;
    lng: number;
    weight: number;
    originLat: number;
    originLng: number;
  }

  function buildArcSources(data: TrafficData): ArcSource[] {
    var sources: ArcSource[] = [];
    var maxCountry = data.topCountries[0]?.requests ?? 1;

    for (var i = 0; i < data.topCountries.length; i++) {
      var country = data.topCountries[i]!;
      var weight = country.requests / maxCountry;
      var origin = nearestOrigin(country.lat, country.lng);
      sources.push({
        code: country.code,
        lat: country.lat,
        lng: country.lng,
        weight: weight,
        originLat: origin.lat,
        originLng: origin.lng,
      });
    }
    return sources;
  }

  /** Pick one random arc from sources, weighted by traffic, with jitter */
  function pickOne(sources: ArcSource[]): Arc {
    var totalW = 0;
    for (var i = 0; i < sources.length; i++) {
      totalW += Math.pow(sources[i]!.weight, 0.4) + 0.1;
    }
    var r = Math.random() * totalW;
    var cum = 0;
    for (var i = 0; i < sources.length; i++) {
      cum += Math.pow(sources[i]!.weight, 0.4) + 0.1;
      if (cum >= r) {
        var src = sources[i]!;
        var radius = JITTER[src.code] ?? DEFAULT_JITTER;
        var jittered = jitter(src.lat, src.lng, radius);
        return makeArc(jittered[0], jittered[1], src.originLat, src.originLng, src.weight);
      }
    }
    var last = sources[sources.length - 1]!;
    var jittered = jitter(last.lat, last.lng, JITTER[last.code] ?? DEFAULT_JITTER);
    return makeArc(jittered[0], jittered[1], last.originLat, last.originLng, last.weight);
  }

  async function init() {
    var container = document.getElementById("globe-container");
    if (!container) return;

    var msgEl = document.getElementById("globe-message");

    var dataPromise = fetch("/api/network")
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });

    var topoPromise = fetch(TOPO_URL)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });

    var [rawData, topology] = await Promise.all([dataPromise, topoPromise]);
    var data = rawData as TrafficData | null;

    if (!data?.topCountries?.length) {
      if (msgEl) msgEl.textContent = "No traffic data yet";
      return;
    }

    populateStats(data);
    if (msgEl) msgEl.style.display = "none";

    var Globe: any;
    var topojson: any;
    try {
      var [globeMod, topoMod] = await Promise.all([
        import("globe.gl"),
        import("topojson-client" as any).catch(function () {
          return null;
        }),
      ]);
      Globe = globeMod.default;
      topojson = topoMod;
    } catch {
      if (msgEl) {
        msgEl.style.display = "";
        msgEl.textContent = "Failed to load globe";
      }
      return;
    }

    var colors = getColors();
    var width = container.clientWidth;
    var height = container.clientHeight || width;

    // Parse land polygons
    var landFeatures: any[] = [];
    if (topology && topojson) {
      try {
        var topo = topology as any;
        var countries = topojson.feature(topo, topo.objects.countries || topo.objects.land);
        landFeatures = countries.features || [countries];
      } catch {
        /* no land */
      }
    }

    // Points: origins + all edge colos
    var points: any[] = [];
    for (var i = 0; i < ORIGINS.length; i++) {
      points.push({
        lat: ORIGINS[i]!.lat,
        lng: ORIGINS[i]!.lng,
        size: 1.0,
        color: colors.origin,
        isOrigin: true,
      });
    }
    for (var i = 0; i < data.edgeColos.length; i++) {
      var c = data.edgeColos[i]!;
      points.push({
        lat: c.lat,
        lng: c.lng,
        size: 0.5,
        color: colors.point,
        isOrigin: false,
      });
    }

    var ringData = ORIGINS.map(function (o) {
      return { lat: o.lat, lng: o.lng };
    });

    var globe = Globe()
      .width(width)
      .height(height)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor(colors.atmosphere)
      .atmosphereAltitude(0.15)
      .polygonsData(landFeatures)
      .polygonCapColor(function () {
        return colors.land;
      })
      .polygonSideColor(function () {
        return "rgba(0,0,0,0)";
      })
      .polygonStrokeColor(function () {
        return colors.landStroke;
      })
      .polygonAltitude(0.006)
      .pointsData(points)
      .pointColor(function (d: any) {
        return d.color;
      })
      .pointRadius(function (d: any) {
        return d.isOrigin ? 0.5 : 0.3;
      })
      .pointAltitude(function (d: any) {
        return d.isOrigin ? 0.025 : 0.01;
      })
      .ringsData(ringData)
      .ringColor(function () {
        return colors.origin;
      })
      .ringMaxRadius(3)
      .ringPropagationSpeed(1.5)
      .ringRepeatPeriod(1200)
      .arcColor(function () {
        return [colors.arc, colors.arcAlt];
      })
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashInitialGap(function (d: any) {
        return d.dashGap;
      })
      .arcDashAnimateTime(2500)
      .arcStroke(0.3)
      .arcsTransitionDuration(0)(container);

    // Style globe surface
    var globeMat = globe.globeMaterial();
    if (globeMat) {
      var rgb = hexToRgb(colors.globe);
      globeMat.color.setRGB(rgb.r, rgb.g, rgb.b);
      globeMat.emissive = globeMat.color.clone();
      globeMat.emissiveIntensity = 0.05;
    }

    var controls = globe.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.enableZoom = false;
    }

    globe.pointOfView({ lat: 25, lng: -40, altitude: 2.0 });

    // --- Staggered arc cycling ---
    // Start with a full set, then replace ONE arc at a time on a fast interval
    var arcSources = buildArcSources(data);
    var ARC_COUNT = 18;
    var activeArcs: Arc[] = [];
    for (var i = 0; i < ARC_COUNT; i++) {
      activeArcs.push(pickOne(arcSources));
    }
    globe.arcsData(activeArcs);

    // Replace one arc every 800ms — no visible "reset"
    var replaceIdx = 0;
    setInterval(function () {
      activeArcs[replaceIdx] = pickOne(arcSources);
      replaceIdx = (replaceIdx + 1) % ARC_COUNT;
      globe.arcsData(activeArcs.slice()); // shallow copy triggers update
    }, 800);

    // Resize — fill entire container
    function onResize() {
      var w = container!.clientWidth;
      var h = container!.clientHeight || w;
      globe.width(w).height(h);
    }
    window.addEventListener("resize", onResize);

    // Theme
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      isDark = e.matches;
      var c = getColors();
      globe
        .atmosphereColor(c.atmosphere)
        .pointColor(function (d: any) {
          return d.isOrigin ? c.origin : c.point;
        })
        .arcColor(function () {
          return [c.arc, c.arcAlt];
        })
        .polygonCapColor(function () {
          return c.land;
        })
        .polygonStrokeColor(function () {
          return c.landStroke;
        })
        .ringColor(function () {
          return c.origin;
        });

      for (var j = 0; j < points.length; j++) {
        points[j].color = points[j].isOrigin ? c.origin : c.point;
      }
      globe.pointsData(points);

      var mat = globe.globeMaterial();
      if (mat) {
        var rgb = hexToRgb(c.globe);
        mat.color.setRGB(rgb.r, rgb.g, rgb.b);
        mat.emissive = mat.color.clone();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
