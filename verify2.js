const API = "http://localhost:3000";
const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
};
const show = (l, r) => console.log(`${r.status}  ${l}  ${Array.isArray(r.data?.message) ? r.data.message.join(" | ") : r.data?.message ?? ""}`);
(async () => {
  const l = await req("POST", "/auth/login", { body: { username: "manager", password: "Manager123!" } });
  const v = await req("POST", "/auth/verify-login-otp", { body: { email: l.data.email, otp: l.data.devOtp } });
  const token = v.data.accessToken;
  const s = String(Date.now()).slice(-9);

  // R4 redo: duplicate IMEI with a VALID model -> must be 409 from the Prisma filter
  const imei = "352099" + s;
  const sim  = "89310" + s + "0";
  show("create #1 (expect 201)", await req("POST", "/trackers", { token, body: { imei, model: "Teltonika FMB640", simNumber: sim } }));
  show("create #2 same IMEI (expect 409)", await req("POST", "/trackers", { token, body: { imei, model: "Teltonika FMB640", simNumber: "89310" + s + "1" } }));
  show("create #3 same SIM, new IMEI (expect 409)", await req("POST", "/trackers", { token, body: { imei: "352099" + s + "9", model: "Teltonika FMB640", simNumber: sim } }));
  show("forbiddenNonWhitelisted extra field (expect 400)", await req("POST", "/trackers", { token, body: { imei, model: "Valid Model", simNumber: "8931000000000000099", status: "INSTALLED" } }));
  show("PATCH model only (expect 200)", await req("PATCH", `/trackers/${(await req("GET", "/trackers?search=" + imei, { token })).data.data[0].id}`, { token, body: { model: "Teltonika FMB920" } }));

  // vehicleId clearing: force a tracker to INSTALLED on a vehicle, then leave INSTALLED
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  const client = await p.client.create({ data: { name: "TmpCo", phone: "000", address: "Tmp" } });
  const vehicle = await p.vehicle.create({ data: { clientId: client.id, plate: "TMP-1", brand: "B", model: "M" } });
  const t = await p.tracker.findFirst({ where: { imei } });
  await p.tracker.update({ where: { id: t.id }, data: { status: "INSTALLED", vehicleId: vehicle.id } });
  await p.$disconnect();

  const before = (await req("GET", `/trackers/${t.id}`, { token })).data;
  console.log(`\nseeded INSTALLED on vehicle ${before.vehicle.plate}, vehicleId=${before.vehicleId}`);
  show("INSTALLED->RETURNED (expect 200)", await req("PATCH", `/trackers/${t.id}/status`, { token, body: { status: "RETURNED", comment: "removed at depot" } }));
  const after = (await req("GET", `/trackers/${t.id}`, { token })).data;
  console.log(`   vehicleId after = ${after.vehicleId}  (expect null)  status=${after.status}`);
  const hist = (await req("GET", `/trackers/${t.id}/history`, { token })).data;
  const removed = hist.find(h => h.action === "REMOVED");
  console.log(`   REMOVED history row keeps vehicle: ${removed?.vehicle?.plate} (expect TMP-1), comment="${removed?.comment}"`);

  show("delete FAULTY tracker (expect 409)", await req("DELETE", `/trackers/${t.id}`, { token }));
  await req("PATCH", `/trackers/${t.id}/status`, { token, body: { status: "IN_STOCK" } });
  show("delete IN_STOCK tracker (expect 200)", await req("DELETE", `/trackers/${t.id}`, { token }));
  const g = await req("GET", `/trackers/${t.id}`, { token });
  console.log(`   GET after delete -> ${g.status} (expect 404)`);
  process.exit(0);
})();

