// Initialize Map
const map = L.map("map").setView([12.9716, 77.5946], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// Global Variables
let treeData, schoolData, index, chartInstance;
const clusterLayer = L.layerGroup().addTo(map);

// Load Ward Boundaries
fetch("data/wards.geojson")
  .then((res) => res.json())
  .then((wards) => {
    L.geoJSON(wards, {
      onEachFeature: (feature, layer) => {
        layer.on("click", () => showWardDetails(feature));
        layer.bindTooltip(`Ward_Name: ${feature.properties.KGISWardName}`);
      },
      style: {
        color: "#555",
        weight: 1,
        fillOpacity: 0.1,
      },
    }).addTo(map);
  });

// Load and Cluster Tree Data
fetch("data/trees.geojson")
  .then((res) => res.json())
  .then((data) => {
    treeData = data;
    index = new Supercluster({ radius: 40, maxZoom: 18 }).load(
      treeData.features
    );
    updateClusters();
  });

// Throttled cluster update
let clusterTimeout;
map.on("moveend", () => {
  clearTimeout(clusterTimeout);
  clusterTimeout = setTimeout(updateClusters, 200);
});

// Update tree clusters
function updateClusters() {
  if (!index) return;

  const bounds = map.getBounds();
  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
  const zoom = map.getZoom();
  const clusters = index.getClusters(bbox, zoom);

  clusterLayer.clearLayers();

  clusters.forEach((cluster) => {
    const [lng, lat] = cluster.geometry.coordinates;

    if (cluster.properties.cluster) {
      const count = cluster.properties.point_count;
      const marker = L.circleMarker([lat, lng], {
        radius: Math.sqrt(count) * 2,
        color: "#3388ff",
        fillOpacity: 0.6,
      }).bindTooltip(`${count} trees`);

      marker.on("click", () => map.flyTo([lat, lng], zoom + 2));
      clusterLayer.addLayer(marker);
    } else {
      const marker = L.circleMarker([lat, lng], {
        radius: 4,
        color: getColorByTreeType(cluster.properties.TreeName),
        fillOpacity: 0.7,
      }).bindPopup(`
        <b>Tree Name:</b> ${cluster.properties.TreeName}<br/>
        <b>Ward Number:</b> ${cluster.properties.WardNumber}<br/>
        <b>Tree ID:</b> ${cluster.properties.KGISTreeID}
      `);
      clusterLayer.addLayer(marker);
    }
  });
}

// Tree color by type
function getColorByTreeType(treeName) {
  const colors = {
    "Mangifera Indica L.": "orange",
    "Thespesia Populnea": "green",
    "Acacia Nilotica (L.) Del. Subsp. Indica (Benth.) Brenan": "brown",
    "Albizia Lebbeck (L.) Benth.": "purple",
    "Pongamia Pinnata (L.) Pierre": "yellow",
    "Samanea Saman (Jacq.) Merr.": "red",
    "Bauhinia Racemosa Lam": "black",
  };
  return colors[treeName] || "blue";
}

// Load and Cluster School Data
fetch("data/schools.geojson")
  .then((res) => res.json())
  .then((data) => {
    schoolData = data;
    const schoolMarkers = L.markerClusterGroup();

    const schoolLayer = L.geoJSON(schoolData, {
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng).bindPopup(
          `          <b>School_info:</b> ${
            feature.properties.name || "Unknown"
          }          `
        );
      },
      onEachFeature: (feature, layer) => {
        if (feature.geometry.type === "Polygon") {
          layer.bindPopup(
            `<b>School Area:</b> ${feature.properties.name || "Unknown"}`
          );
        }
      },
    });

    schoolMarkers.addLayer(schoolLayer);
    map.addLayer(schoolMarkers);
  });

// Render or update Pie Chart
function renderPieChart(treeDist) {
  const ctx = document.getElementById("treeChart").getContext("2d");

  if (chartInstance) {
    chartInstance.data.labels = Object.keys(treeDist);
    chartInstance.data.datasets[0].data = Object.values(treeDist);
    chartInstance.update();
  } else {
    chartInstance = new Chart(ctx, {
      type: "pie",
      data: {
        labels: Object.keys(treeDist),
        datasets: [
          {
            data: Object.values(treeDist),
            backgroundColor: ["green", "brown", "purple", "orange", "blue"],
          },
        ],
      },
      options: { responsive: false },
    });
  }
}

// Sidebar Text Update
function updateSidebar(treeCount, schoolCount, elevation) {
  document.getElementById(
    "schoolCount"
  ).textContent = `Schools: ${schoolCount}`;
  document.getElementById(
    "elevation"
  ).textContent = `Avg Elevation: ${elevation} m`;
  document.getElementById("treeDist").textContent = `Trees: ${treeCount}`;
}

// Show details when ward clicked
function showWardDetails(wardFeature) {
  if (!treeData || !schoolData) {
    console.warn("GeoJSON data not loaded yet.");
    return;
  }

  const pointFeatures = schoolData.features.filter(
    (f) => f.geometry.type === "Point"
  );
  const polygonFeatures = schoolData.features.filter(
    (f) => f.geometry.type === "Polygon"
  );

  const schoolPoints = {
    type: "FeatureCollection",
    features: pointFeatures,
  };

  const schoolsInWard = turf.pointsWithinPolygon(schoolPoints, wardFeature);
  const polygonSchoolsInWard = polygonFeatures.filter((f) =>
    turf.booleanIntersects(f, wardFeature)
  );

  const totalSchoolCount =
    schoolsInWard.features.length + polygonSchoolsInWard.length;

  const treesInWard = turf.pointsWithinPolygon(treeData, wardFeature);
  const elevationValues = getElevationStatsWithinWard(wardFeature);

  const treeTypes = {};
  treesInWard.features.forEach((f) => {
    const name = f.properties.TreeName;
    treeTypes[name] = (treeTypes[name] || 0) + 1;
  });

  renderPieChart(treeTypes);
  updateSidebar(
    treesInWard.features.length,
    totalSchoolCount,
    elevationValues.mean.toFixed(2)
  );

  document.getElementById("ward-info").innerHTML = `
    <h5>Ward_Name: ${wardFeature.properties.KGISWardName}</h5>`;
}

function getElevationStatsWithinWard(wardFeature) {
  // Simulated mean elevation
  return { mean: 920 + Math.random() * 30 }; // returns between 920–950m
}

console.log("Leaflet-Geotiff:", L.LeafletGeotiff);
console.log("Palette Renderer:", L.LeafletGeotiff?.Palette);

// Load and overlay DEM
window.addEventListener("load", () => {
  fetch("data/NASADEM_HGT_n27e086_elevation.tif")
    .then((res) => res.arrayBuffer())
    .then((tiffBuffer) => {
      const demLayer = new L.LeafletGeotiff(tiffBuffer, {
        band: 1,
        name: "Elevation",
        displayMin: 880,
        displayMax: 970,
        opacity: 0.6,
        renderer: new L.LeafletGeotiff.Palette({
          palette: [
            "#0000ff",
            "#00ffff",
            "#00ff00",
            "#ffff00",
            "#ff8000",
            "#ff0000",
          ],
          scale: "linear",
        }),
      });

      demLayer.addTo(map);
    })
    .catch((err) => console.error("DEM Load Error:", err));
});
