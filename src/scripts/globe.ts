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

  var isDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  function getColors() {
    return {
      globe: isDark ? "#141211" : "#f5f5f4",
      atmosphere: isDark ? "#fb923c" : "#c2410c",
      arc: isDark ? "#fb923c" : "#c2410c",
      arcAlt: isDark ? "#fed7aa" : "#ea580c",
      point: isDark ? "#fb923c" : "#c2410c",
      land: isDark ? "#292524" : "#e7e5e4",
      border: isDark ? "#44403c" : "#d6d3d1",
      bg: isDark ? "#0c0a09" : "#faf9f7",
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
      // Connect each country to its nearest colos (pick top 3 colos)
      var colos = data.edgeColos.slice(0, Math.min(data.edgeColos.length, 15));
      // Sort by distance to country
      var sorted = colos
        .map(function (c) {
          var dlat = c.lat - country.lat;
          var dlng = c.lng - country.lng;
          return { colo: c, dist: Math.sqrt(dlat * dlat + dlng * dlng) };
        })
        .sort(function (a, b) {
          return a.dist - b.dist;
        });

      var targets = sorted.slice(0, 2);
      for (var j = 0; j < targets.length; j++) {
        arcs.push({
          startLat: country.lat,
          startLng: country.lng,
          endLat: targets[j]!.colo.lat,
          endLng: targets[j]!.colo.lng,
          weight: country.requests / maxCountry,
        });
      }
    }
    return arcs;
  }

  function pickActiveArcs(pool: Arc[], count: number): Arc[] {
    // Weighted random selection favoring high-traffic arcs
    var selected: Arc[] = [];
    var weights = pool.map(function (a) {
      return Math.pow(a.weight, 0.5);
    });
    var totalWeight = weights.reduce(function (s, w) {
      return s + w;
    }, 0);

    for (var i = 0; i < count && pool.length > 0; i++) {
      var r = Math.random() * totalWeight;
      var cumulative = 0;
      for (var j = 0; j < pool.length; j++) {
        cumulative += weights[j]!;
        if (cumulative >= r) {
          selected.push(pool[j]!);
          break;
        }
      }
    }
    return selected;
  }

  async function init() {
    var container = document.getElementById("globe-container");
    if (!container) return;

    var msgEl = document.getElementById("globe-message");

    // Fetch traffic data
    var res: Response;
    try {
      res = await fetch("/api/network");
    } catch {
      if (msgEl) msgEl.textContent = "Traffic data unavailable";
      return;
    }

    if (!res.ok) {
      if (msgEl) msgEl.textContent = "Traffic data unavailable";
      return;
    }

    var data: TrafficData;
    try {
      data = (await res.json()) as TrafficData;
    } catch {
      if (msgEl) msgEl.textContent = "Traffic data unavailable";
      return;
    }

    if (!data.topCountries?.length) {
      if (msgEl) msgEl.textContent = "No traffic data yet";
      return;
    }

    populateStats(data);
    if (msgEl) msgEl.style.display = "none";

    // Dynamically import globe.gl
    var Globe: any;
    try {
      var mod = await import("globe.gl");
      Globe = mod.default;
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
    var height = width; // 1:1 aspect

    var globe = Globe()
      .width(width)
      .height(height)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor(colors.atmosphere)
      .atmosphereAltitude(0.15)
      // Points for edge colos
      .pointsData(
        data.edgeColos.map(function (c) {
          return {
            lat: c.lat,
            lng: c.lng,
            size: 0.3 + (c.requests / maxColo) * 0.7,
            label: c.code,
          };
        }),
      )
      .pointAltitude("size")
      .pointRadius(0.4)
      .pointColor(function () {
        return colors.point;
      })
      .pointAltitude(function (d: any) {
        return 0.01 + d.size * 0.02;
      })
      // Arcs
      .arcColor(function () {
        return [colors.arc, colors.arcAlt];
      })
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashAnimateTime(1500)
      .arcStroke(function (d: any) {
        return 0.3 + (d.weight ?? 0.5) * 0.7;
      })(container);

    // Apply globe material color
    var globeMat = globe.globeMaterial();
    if (globeMat) {
      globeMat.color = { r: 0, g: 0, b: 0 };
      // Parse hex to RGB
      var hex = colors.globe.replace("#", "");
      globeMat.color = {
        r: parseInt(hex.substring(0, 2), 16) / 255,
        g: parseInt(hex.substring(2, 4), 16) / 255,
        b: parseInt(hex.substring(4, 6), 16) / 255,
      };
      globeMat.emissive = globeMat.color;
      globeMat.emissiveIntensity = 0.1;
    }

    // Auto-rotate
    var controls = globe.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;
      controls.enableZoom = false;
    }

    // Set initial POV
    globe.pointOfView({ lat: 20, lng: -20, altitude: 2.2 });

    // Arc cycling
    var arcPool = buildArcPool(data);
    var activeArcs = pickActiveArcs(arcPool, 18);
    globe.arcsData(activeArcs);

    setInterval(function () {
      activeArcs = pickActiveArcs(arcPool, 18);
      globe.arcsData(activeArcs);
    }, 3000);

    // Responsive resize
    window.addEventListener("resize", function () {
      var w = container!.clientWidth;
      globe.width(w).height(w);
    });

    // Dark/light mode changes
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", function (e) {
        isDark = e.matches;
        var c = getColors();
        globe
          .atmosphereColor(c.atmosphere)
          .pointColor(function () {
            return c.point;
          })
          .arcColor(function () {
            return [c.arc, c.arcAlt];
          });

        var mat = globe.globeMaterial();
        if (mat) {
          var h = c.globe.replace("#", "");
          mat.color = {
            r: parseInt(h.substring(0, 2), 16) / 255,
            g: parseInt(h.substring(2, 4), 16) / 255,
            b: parseInt(h.substring(4, 6), 16) / 255,
          };
          mat.emissive = mat.color;
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
