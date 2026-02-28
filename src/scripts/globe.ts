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
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    weight: number;
  }

  // OVH dedicated server in Beauharnois, Quebec (near Ontario border)
  var ORIGIN_SERVER = { lat: 45.31, lng: -73.87, label: "Origin (OVH BHS)" };

  var TOPO_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

  var isDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  function getColors() {
    return {
      globe: isDark ? "#141211" : "#f5f5f4",
      atmosphere: isDark ? "#fb923c" : "#c2410c",
      arc: isDark ? "rgba(251,146,60,0.6)" : "rgba(194,65,12,0.6)",
      arcAlt: isDark ? "rgba(254,215,170,0.35)" : "rgba(234,88,12,0.35)",
      point: isDark ? "#fb923c" : "#c2410c",
      land: isDark ? "#1c1917" : "#e7e5e4",
      landStroke: isDark ? "#292524" : "#d6d3d1",
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

  function buildArcPool(data: TrafficData): Arc[] {
    var arcs: Arc[] = [];
    var maxCountry = data.topCountries[0]?.requests ?? 1;

    for (var i = 0; i < data.topCountries.length; i++) {
      var country = data.topCountries[i]!;
      var weight = country.requests / maxCountry;

      // Arc from country → origin server
      arcs.push({
        startLat: country.lat,
        startLng: country.lng,
        endLat: ORIGIN_SERVER.lat,
        endLng: ORIGIN_SERVER.lng,
        weight: weight,
      });

      // Also arc to nearest edge colo if different from origin
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
        arcs.push({
          startLat: country.lat,
          startLng: country.lng,
          endLat: nearest.lat,
          endLng: nearest.lng,
          weight: weight,
        });
      }
    }
    return arcs;
  }

  function pickActiveArcs(pool: Arc[], count: number): Arc[] {
    if (pool.length <= count) return pool.slice();

    // Weighted random without replacement
    var indices = pool.map(function (_, i) {
      return i;
    });
    var selected: Arc[] = [];

    for (var i = 0; i < count; i++) {
      // Weight by sqrt for more even distribution
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
      selected.push(pool[indices[pick]!]!);
      indices.splice(pick, 1);
    }
    return selected;
  }

  async function init() {
    var container = document.getElementById("globe-container");
    if (!container) return;

    var msgEl = document.getElementById("globe-message");

    // Fetch traffic data and world topology in parallel
    var dataPromise = fetch("/api/network").then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () {
      return null;
    });

    var topoPromise = fetch(TOPO_URL).then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () {
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

    // Dynamically import globe.gl
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

    // Build land polygons from topology
    var landFeatures: any[] = [];
    if (topology && topojson) {
      try {
        var countries = topojson.feature(
          topology,
          topology.objects.countries || topology.objects.land,
        );
        landFeatures = countries.features || [countries];
      } catch {
        // Fallback: no land rendering
      }
    }

    // Build points: edge colos + origin server
    var points: any[] = [];

    // Origin server (cyan, larger)
    points.push({
      lat: ORIGIN_SERVER.lat,
      lng: ORIGIN_SERVER.lng,
      size: 1.0,
      color: colors.origin,
      isOrigin: true,
    });

    // Edge colos (accent color, sized by traffic)
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

    var globe = Globe()
      .width(width)
      .height(height)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor(colors.atmosphere)
      .atmosphereAltitude(0.12)
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
      .polygonAltitude(0.005)
      // Points
      .pointsData(points)
      .pointColor(function (d: any) {
        return d.color;
      })
      .pointRadius(function (d: any) {
        return d.isOrigin ? 0.6 : 0.35;
      })
      .pointAltitude(function (d: any) {
        return d.isOrigin ? 0.03 : 0.01 + d.size * 0.015;
      })
      // Arcs
      .arcColor(function () {
        return [colors.arc, colors.arcAlt];
      })
      .arcDashLength(0.5)
      .arcDashGap(0.3)
      .arcDashAnimateTime(2000)
      .arcStroke(function (d: any) {
        return 0.2 + (d.weight ?? 0.3) * 0.5;
      })
      .arcsTransitionDuration(800)(container);

    // Style the globe surface
    var globeMat = globe.globeMaterial();
    if (globeMat) {
      var rgb = hexToRgb(colors.globe);
      globeMat.color.setRGB(rgb.r, rgb.g, rgb.b);
      globeMat.emissive = globeMat.color.clone();
      globeMat.emissiveIntensity = 0.08;
    }

    // Controls
    var controls = globe.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
      controls.enableZoom = false;
    }

    // Initial POV — centered on Atlantic to show US + Europe
    globe.pointOfView({ lat: 25, lng: -40, altitude: 2.0 });

    // Arc cycling — smooth transition with overlapping sets
    var arcPool = buildArcPool(data);
    var activeArcs = pickActiveArcs(arcPool, 15);
    globe.arcsData(activeArcs);

    setInterval(function () {
      // Gradually rotate arcs: keep half, replace half
      var keep = Math.floor(activeArcs.length / 2);
      var kept = activeArcs.slice(0, keep);
      var fresh = pickActiveArcs(arcPool, activeArcs.length - keep);
      activeArcs = kept.concat(fresh);
      globe.arcsData(activeArcs);
    }, 4000);

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
          });

        // Update points data to refresh colors
        for (var i = 0; i < points.length; i++) {
          points[i].color = points[i].isOrigin ? c.origin : c.point;
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
