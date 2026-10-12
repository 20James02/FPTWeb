import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

function model() {
  const path = "src/pagefpt/static/js/client/speed_model.js";
  assert.ok(fs.existsSync(path), "Speed measurement model must exist");
  const context = vm.createContext({ window: {}, Number, Math, Array, Set });
  vm.runInContext(fs.readFileSync(path, "utf8"), context);
  return context.window.PageFPTSpeedModel;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test("location suggestions only match unique published names in Vietnam and scoped wards", () => {
  const m = model();
  const hierarchy = {
    south: {
      provinces: [
        { code: "hcm", name: "Thành phố Hồ Chí Minh" },
        { code: "dn", name: "Tỉnh Đồng Nai" },
      ],
    },
  };
  const place = {
    countryCode: "VN",
    lookupSource: "reverseGeocoding",
    principalSubdivision: "Ho Chi Minh City",
    locality: "Phường Vũng Tàu",
  };
  assert.equal(m.locationProvince(place, hierarchy).id, "hcm");
  assert.equal(
    m.locationProvince({ ...place, countryCode: "US" }, hierarchy),
    null,
  );
  assert.equal(
    m.locationProvince({ ...place, lookupSource: "ipGeolocation" }, hierarchy),
    null,
  );
  assert.equal(
    m.locationProvince(
      { ...place, principalSubdivision: "Hồ Chí Minh 2" },
      hierarchy,
    ),
    null,
  );
  assert.equal(
    m.locationProvince(place, {
      a: {
        provinces: [
          { code: "one", name: "Hồ Chí Minh" },
          { code: "two", name: "Hồ Chí Minh" },
        ],
      },
    }),
    null,
  );
  const wards = [
    { id: "vt", name: "Vũng Tàu" },
    { id: "another", name: "Phường Tam Thắng" },
  ];
  assert.equal(m.locationWard(place, wards, 50).id, "vt");
  assert.equal(m.locationWard(place, wards, 20000), null);
  assert.equal(
    m.locationWard(place, [...wards, { id: "dup", name: "Vũng Tàu" }], 50),
    null,
  );
  assert.equal(
    m.locationWard({ ...place, locality: "Unknown" }, wards, 50),
    null,
  );
});

test("actual SDK empty latency buckets are unavailable; sampled zero remains valid", async () => {
  const source = fs.readFileSync(
    "src/pagefpt/static/js/vendor/cloudflare-speedtest-1.14.1.js",
    "utf8",
  );
  const { default: SpeedTest } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const engine = new SpeedTest(model().config());
  const results = engine.results;
  results.raw.latency = {
    started: true,
    finished: false,
    results: { timings: [] },
  };
  for (const type of ["download", "upload"]) {
    results.raw[type] = {
      started: true,
      finished: true,
      results: {
        10000000: {
          timings: [{ duration: 100, bps: 800e6 }],
          sideLatency: [{ ping: 20 }],
        },
      },
    };
  }
  assert.equal(results.getSummary().downLoadedLatency, 0);
  assert.equal(results.getDownLoadedLatencyPoints().length, 0);
  const m = model();
  const s = m.snapshot(
    results.getSummary(),
    results.getUnloadedLatencyPoints(),
    {
      download: results.getDownLoadedLatencyPoints(),
      upload: results.getUpLoadedLatencyPoints(),
    },
  );
  for (const key of [
    "latency",
    "jitter",
    "downLoadedLatency",
    "upLoadedLatency",
    "downLoadedJitter",
    "upLoadedJitter",
  ])
    assert.equal(s[key], null, key + " must need actual eligible samples");
  assert.equal(m.snapshot({ latency: 0, jitter: 0 }, [0]).latency, 0);
  assert.equal(m.snapshot({ latency: 0, jitter: 0 }, [0]).jitter, null);
  assert.equal(m.snapshot({ latency: 0, jitter: 0 }, [0, 0]).jitter, 0);
  assert.equal(
    m.snapshot({ downLoadedLatency: 0, downLoadedJitter: 0 }, [], {
      download: [0, 0],
    }).downLoadedJitter,
    0,
  );
});

test("manual measurement config limits payload and disables logging/unsupported packet loss", () => {
  const c = model().config();
  assert.equal(c.autoStart, false);
  assert.equal(c.logAimApiUrl, null);
  assert.equal(c.logMeasurementApiUrl, null);
  assert.equal(c.includeCredentials, false);
  assert.equal(c.bandwidthAbortRequestDuration, 10000);
  assert.equal(
    c.measurements.some((x) => x.type === "packetLoss"),
    false,
  );
  const bytes = c.measurements.reduce(
    (n, x) => n + (x.bytes || 0) * (x.count || 0),
    0,
  );
  assert.equal(bytes, 56_400_000);
  assert.equal(c.measurements[0].numPackets, 12);
});

test("metrics use real units, preserve missing data, and do not coerce strings or negative samples", () => {
  const m = model();
  const s = m.snapshot(
    {
      download: 300e6,
      upload: 40e6,
      latency: 20,
      jitter: 2,
      downLoadedLatency: 60,
    },
    [18, 20, 22],
  );
  assert.equal(s.download, 300);
  assert.equal(s.upload, 40);
  assert.equal(s.latency, 20);
  assert.equal(s.pingMin, 18);
  assert.equal(s.pingMax, 22);
  assert.equal(s.pingSamples, 3);
  for (const x of [undefined, null, NaN, Infinity, -1, "100"]) {
    const bad = m.snapshot({ download: x, latency: x }, [x]);
    assert.equal(bad.download, null);
    assert.equal(bad.latency, null);
    assert.equal(bad.pingSamples, 0);
  }
  assert.equal(
    m.snapshot({ latency: 0, jitter: 0, download: 0 }, [0]).latency,
    0,
  );
  assert.equal(m.snapshot({ download: 0 }, []).download, null);
  assert.equal(s.upLoadedLatency, null);
});

test("recommendations respect published catalog types and province/ward applicability with stable ranking", () => {
  const p = (id, speed, regions = [], service = "internet") => ({
    id,
    name: id,
    speed_mbps: speed,
    applicable_region_ids: regions,
    service,
  });
  const rows = [
    p("camera", 100, [], "camera"),
    p("ward", 500, ["ward"]),
    p("other", 300, ["other"]),
    p("global", 100),
    p("province", 300, ["province"]),
    p("fast", 1000),
  ];
  const m = model();
  assert.deepEqual(
    plain(
      m.rank(rows, { regionPath: ["ward", "province"], download: 200 }),
    ).map((x) => x.id),
    ["province", "ward", "fast"],
  );
  assert.deepEqual(
    plain(m.rank(rows, { regionPath: ["province"], download: null })).map(
      (x) => x.id,
    ),
    ["global", "province", "fast"],
  );
  assert.deepEqual(
    plain(m.rank(rows, { regionPath: [], download: null })).map((x) => x.id),
    ["global", "fast"],
  );
  assert.deepEqual(
    plain(m.rank([p("b", 300), p("a", 300), p("none", null)], {})).map(
      (x) => x.id,
    ),
    ["a", "b", "none"],
  );
});

test("gauge scale is monotonic and safely handles higher than dial maximum", () => {
  const m = model();
  const values = [0, 10, 100, 300, 1000, 2000].map((x) => m.gauge(x));
  assert.equal(values[0], 0);
  assert.equal(values.at(-1), 1);
  values.forEach((x, i) => {
    assert.ok(x >= 0 && x <= 1);
    if (i) assert.ok(x >= values[i - 1]);
  });
  assert.equal(m.gauge(NaN), 0);
});

test("public metadata does not invent ISP/location and truncates untrusted headers", () => {
  const m = model();
  const headers = {
    get: (key) =>
      ({
        "cf-meta-ip": "192.0.2.3",
        "cf-meta-asn": "12345",
        "cf-meta-colo": "SIN",
        "cf-meta-city": "<script>example</script>",
        "cf-meta-country": "VN",
      })[key] || null,
  };
  const data = m.metadata(headers);
  assert.equal(data.ip, "192.0.2.3");
  assert.equal(data.asn, "AS12345");
  assert.equal(data.colo, "SIN");
  assert.equal(data.isp, undefined);
  assert.equal(m.metadata({ get: () => null }).asn, null);
  assert.equal(m.metadata({ get: () => "a".repeat(1000) }).ip.length, 100);
});

test("RIPE metadata distinguishes ASN holder and approximate location, with ambiguous data left unknown", () => {
  const m = model();
  assert.equal(m.metadataIp("192.0.2.2"), "192.0.2.2");
  assert.equal(m.metadataIp("2001:db8::1"), "2001:db8::1");
  assert.equal(m.metadataIp("customer@example.test"), null);
  assert.equal(m.metadataIp("999.0.2.2"), null);
  assert.equal(m.metadataNetwork({ data: { asns: ["12345"] } }), "AS12345");
  assert.equal(m.metadataNetwork({ data: { asns: ["12345", "67890"] } }), null);
  assert.equal(
    m.metadataHolder({ data: { holder: "QA Telecom" } }),
    "QA Telecom",
  );
  assert.equal(
    m.metadataHolder({ data: { holder: { name: "invalid" } } }),
    null,
  );
  const location = {
    data: {
      located_resources: [{ locations: [{ city: "Vung Tau", country: "VN" }] }],
    },
  };
  assert.deepEqual(plain(m.metadataLocation(location)), {
    city: "Vung Tau",
    country: "VN",
  });
  location.data.located_resources[0].locations.push({
    city: "Other",
    country: "VN",
  });
  assert.equal(m.metadataLocation(location), null);
  assert.equal(m.metadataLocation({ data: {} }), null);
});
