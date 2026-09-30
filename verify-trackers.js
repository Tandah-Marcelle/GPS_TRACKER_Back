const API = "http://localhost:3000";
const log = (...a) => console.log(...a);
const req = async (method, path, { token, body } = {}) => {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
};
const show = (label, r) => {
  const msg = Array.isArray(r.data?.message) ? r.data.message.join(" | ") : r.data?.message;
  log(`${r.status}  ${label}  ${msg ? "-> " + msg : ""}`);
};
(async () => {
  // login as manager (dev OTP is returned outside production)
  const l = await req("POST", "/auth/login", { body: { username: "manager", password: "Manager123!" } });
  if (l.status !== 200 && l.status !== 201) { log("LOGIN FAILED", l.status, JSON.stringify(l.data)); process.exit(1); }
  const v = await req("POST", "/auth/verify-login-otp", { body: { email: l.data.email, otp: l.data.devOtp } });
  if (v.status !== 200 && v.status !== 201) { log("OTP FAILED", v.status, JSON.stringify(v.data)); process.exit(1); }
  const token = v.data.accessToken;
  log("manager token OK, role =", v.data.user.role);

  const imei = "35209900" + String(Date.now()).slice(-7);
  const c = await req("POST", "/trackers", { token, body: { imei, model: "Teltonika FMB640", simNumber: "89310" + String(Date.now()).slice(-11) } });
  show("create tracker", c);
  if (c.status !== 200 && c.status !== 201) process.exit(1);
  const id = c.data.id;
  log("   status =", c.data.status, "(expect IN_STOCK)");

  // R1: history row written on create
  const h1 = await req("GET", `/trackers/${id}/history`, { token });
  log(`\nR1 history-on-create: ${h1.data.length} row(s), action=${h1.data[0].action}, oldStatus=${h1.data[0].oldStatus}, newStatus=${h1.data[0].newStatus}`);

  // R2: manual IN_STOCK -> INSTALLED rejected
  show("\nR2 manual IN_STOCK->INSTALLED (expect 400)", await req("PATCH", `/trackers/${id}/status`, { token, body: { status: "INSTALLED" } }));

  // R3: invalid IMEI
  show("R3 IMEI 10 digits (expect 400)", await req("POST", "/trackers", { token, body: { imei: "12345", model: "X", simNumber: "99999" } }));

  // R4: duplicate IMEI -> 409
  show("R4 duplicate IMEI (expect 409)", await req("POST", "/trackers", { token, body: { imei, model: "X", simNumber: "8931000000000000000" } }));

  // R5: IN_STOCK -> FAULTY
  show("R5 IN_STOCK->FAULTY (expect 200)", await req("PATCH", `/trackers/${id}/status`, { token, body: { status: "FAULTY", comment: "no power" } }));
  // R6: FAULTY -> RETURNED
  show("R6 FAULTY->RETURNED (expect 200)", await req("PATCH", `/trackers/${id}/status`, { token, body: { status: "RETURNED" } }));
  // R7: RETURNED -> IN_STOCK
  show("R7 RETURNED->IN_STOCK (expect 200)", await req("PATCH", `/trackers/${id}/status`, { token, body: { status: "IN_STOCK" } }));
  // R8: FAULTY -> IN_STOCK invalid
  show("R8 FAULTY->IN_STOCK skipped step (expect 4xx)", await req("PATCH", `/trackers/${id}/status`, { token, body: { status: "FAULTY" } }));
  show("   then FAULTY->IN_STOCK (expect 409)", await req("PATCH", `/trackers/${id}/status`, { token, body: { status: "IN_STOCK" } }));

  // full history
  const h2 = await req("GET", `/trackers/${id}/history`, { token });
  log("\nHistory rows:", h2.data.length);
  h2.data.slice().reverse().forEach(r => log(`   ${r.oldStatus ?? "null"} -> ${r.newStatus}  [${r.action}]  by ${r.user.username}`));

  // R9: filters + search + pagination
  const f = await req("GET", "/trackers?status=IN_STOCK&page=1&limit=2", { token });
  log(`\nR9 filter+page: returned ${f.data.data.length}, total=${f.data.meta.total}, totalPages=${f.data.meta.totalPages}`);
  const s = await req("GET", `/trackers?search=${imei.slice(0,9)}`, { token });
  log(`R9 search by IMEI prefix: ${s.data.data.length} match(es)`);

  // R10: available (manager + technician)
  const a1 = await req("GET", "/trackers/available", { token });
  log(`\nR10 /available as manager: ${Array.isArray(a1.data) ? a1.data.length : JSON.stringify(a1.data)} tracker(s)`);

  const t = await req("POST", "/auth/login", { body: { username: "tech1", password: "Tech123!" } });
  const tv = await req("POST", "/auth/verify-login-otp", { body: { email: t.data.email, otp: t.data.devOtp } });
  const ttoken = tv.data.accessToken;
  const a2 = await req("GET", "/trackers/available", { token: ttoken });
  log(`R10 /available as technician: ${Array.isArray(a2.data) ? a2.data.length : a2.status} (200 expected)`);
  show("R11 technician GET /trackers (expect 403)", await req("GET", "/trackers", { token: ttoken }));
  show("R12 technician POST /trackers (expect 403)", await req("POST", "/trackers", { token: ttoken, body: { imei: "352099001111111", model: "X", simNumber: "8931000000000000001" } }));
  show("R13 no token (expect 401)", await req("GET", "/trackers"));
  show("R14 unknown id (expect 404)", await req("GET", "/trackers/00000000-0000-0000-0000-000000000000", { token }));

  // cleanup
  show("\ncleanup delete IN_STOCK tracker (expect 200)", await req("DELETE", `/trackers/${id}`, { token }));
  process.exit(0);
})();

