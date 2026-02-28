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
    { lat: 45.31, lng: -73.87, label: "OVH BHS (WIP)" },          // Beauharnois, QC — OVH
    { lat: 60.17, lng: 24.94, label: "Hetzner HEL (Flyte)" },     // Helsinki — Hetzner
    { lat: 34.05, lng: -118.24, label: "Vercel US (Carbon)" },     // Vercel US edge
  ];

  var TOPO_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

  var isDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  function getColors() {
    return {
      // Ocean / globe surface
      globe: isDark ? "#0f172a" : "#dbeafe",
      // Land
      land: isDark ? "#1e293b" : "#bbf7d0",
      landStroke: isDark ? "#334155" : "#86efac",
      // Atmosphere glow
      atmosphere: isDark ? "#3b82f6" : "#2563eb",
      // Arcs (traffic lines)
      arc: isDark ? "#fb923c" : "#c2410c",
      arcAlt: isDark ? "#fde68a" : "#ea580c",
      // Edge colo points
      point: isDark ? "#fb923c" : "#c2410c",
      // Origin servers
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

    el = document.getElementById("net-countries");
    if (el) el.textContent = data.topCountries.length.toString();

    el = document.getElementById("net-edges");
    if (el) el.textContent = data.edgeColos.length.toString();

    el = document.getElementById("net-updated");
    if (el) {
      var d = new Date(data.updatedAt);
      el.textContent = d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }

  /** Find the nearest origin server to a country */
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

  var arcIdCounter = 0;

  function makeArc(
    slat: number, slng: number,
    elat: number, elng: number,
    weight: number,
  ): Arc {
    return {
      id: "a" + (arcIdCounter++),
      startLat: slat,
      startLng: slng,
      endLat: elat,
      endLng: elng,
      weight: weight,
      dashGap: Math.random() * 2, // stagger start position
    };
  }

  function buildArcPool(data: TrafficData): Arc[] {
    var arcs: Arc[] = [];
    var maxCountry = data.topCountries[0]?.requests ?? 1;

    for (var i = 0; i < data.topCountries.length; i++) {
      var country = data.topCountries[i]!;
      var weight = country.requests / maxCountry;

      // Arc from country → nearest origin server
      var origin = nearestOrigin(country.lat, country.lng);
      arcs.push(makeArc(
        country.lat, country.lng,
        origin.lat, origin.lng,
        weight,
      ));

      // Also arc to nearest Cloudflare edge colo
      if (data.edgeColos.length > 0) {
        var nearest = data.edgeColos[0]!;
        var bestDist = Infinity;
        for (var j = 0; j < Math.min(data.edgeColos.length, 15); j++) {
          var c = data.edgeColos[j]!;
          var dlat = c.lat - country.lat;
          var dlng = c.lng - country.lng;
          var dist = dlat * dlat + dlng * dlng;
          if (dist < bestDist) {
            bestDist = dist;
            nearest = c;
          }
        }
        arcs.push(makeArc(
          country.lat, country.lng,
          nearest.lat, nearest.lng,
          weight * 0.7,
        ));
      }
    }
    return arcs;
  }

  function pickActiveArcs(pool: Arc[], count: number): Arc[] {
    if (pool.length <= count) {
      // Return fresh copies with new IDs so globe.gl treats them as new objects
      return pool.map(function (a) {
        return makeArc(a.startLat, a.startLng, a.endLat, a.endLng, a.weight);
      });
    }

    var indices = pool.map(function (_, i) {
      return i;
    });
    var selected: Arc[] = [];

    for (var i = 0; i < count; i++) {
      var weights = indices.map(function (idx) {
        return Math.pow(pool[idx]!.weight, 0.4) + 0.1;
      });
      var totalW = weights.reduce(function (s, w) {
        return s + w;
      }, 0);
      var r = Math.random() * totalW;
      var cum = 0;
      var pick = 0;
      for (var j = 0; j < weights.length; j++) {
        cum += weights[j]!;
        if (cum >= r) {
          pick = j;
          break;
        }
      }
      var src = pool[indices[pick]!]!;
      selected.push(makeArc(src.startLat, src.startLng, src.endLat, src.endLng, src.weight));
      indices.splice(pick, 1);
    }
    return selected;
  }

  async function init() {
    var container = document.getElementById("globe-container");
    if (!container) return;

    var msgEl = document.getElementById("globe-message");

    // Fetch traffic data and world topology in parallel
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

    // Dynamically import globe.gl + topojson
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
    var maxColo = data.edgeColos[0]?.requests ?? 1;
    var width = container.clientWidth;
    var height = width;

    // Parse land polygons from TopoJSON
    var landFeatures: any[] = [];
    if (topology && topojson) {
      try {
        var countries = topojson.feature(
          topology,
          topology.objects.countries || topology.objects.land,
        );
        landFeatures = countries.features || [countries];
      } catch {
        // No land rendering
      }
    }

    // Build points: origin servers + edge colos
    var points: any[] = [];

    // Origin servers (cyan, larger, pulsing)
    for (var i = 0; i < ORIGINS.length; i++) {
      points.push({
        lat: ORIGINS[i]!.lat,
        lng: ORIGINS[i]!.lng,
        size: 1.0,
        color: colors.origin,
        isOrigin: true,
      });
    }

    // Edge colos (accent, sized by traffic)
    for (var i = 0; i < data.edgeColos.length; i++) {
      var c = data.edgeColos[i]!;
      points.push({
        lat: c.lat,
        lng: c.lng,
        size: 0.3 + (c.requests / maxColo) * 0.7,
        color: colors.point,
        isOrigin: false,
      });
    }

    // Ring markers for origin servers (separate layer using htmlElements)
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
      // Land polygons
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
      // Points (edge colos + origins)
      .pointsData(points)
      .pointColor(function (d: any) {
        return d.color;
      })
      .pointRadius(function (d: any) {
        return d.isOrigin ? 0.5 : 0.3;
      })
      .pointAltitude(function (d: any) {
        return d.isOrigin ? 0.025 : 0.008 + d.size * 0.012;
      })
      // Rings around origin servers
      .ringsData(ringData)
      .ringColor(function () {
        return colors.origin;
      })
      .ringMaxRadius(3)
      .ringPropagationSpeed(1.5)
      .ringRepeatPeriod(1200)
      // Arcs
      .arcColor(function () {
        return [colors.arc, colors.arcAlt];
      })
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashInitialGap(function (d: any) {
        return d.dashGap;
      })
      .arcDashAnimateTime(2500)
      .arcStroke(function (d: any) {
        return 0.15 + (d.weight ?? 0.3) * 0.45;
      })
      .arcsTransitionDuration(0)(container);

    // Style globe surface (ocean color)
    var globeMat = globe.globeMaterial();
    if (globeMat) {
      var rgb = hexToRgb(colors.globe);
      globeMat.color.setRGB(rgb.r, rgb.g, rgb.b);
      globeMat.emissive = globeMat.color.clone();
      globeMat.emissiveIntensity = 0.05;
    }

    // Controls
    var controls = globe.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.enableZoom = false;
    }

    // Initial POV — Atlantic view showing US, Europe, Africa
    globe.pointOfView({ lat: 25, lng: -40, altitude: 2.0 });

    // Arc cycling — gradual turnover
    var arcPool = buildArcPool(data);
    var activeArcs = pickActiveArcs(arcPool, 15);
    globe.arcsData(activeArcs);

    setInterval(function () {
      // Full swap with fresh arc objects (new IDs + random dashGap offsets)
      activeArcs = pickActiveArcs(arcPool, 15);
      globe.arcsData(activeArcs);
    }, 5000);

    // Resize
    window.addEventListener("resize", function () {
      var w = container!.clientWidth;
      globe.width(w).height(w);
    });

    // Theme change
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", function (e) {
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

        // Update point colors
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
