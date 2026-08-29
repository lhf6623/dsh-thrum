import e from "@deepseek-ai/schemastery";
import { installSettingsSection as t, settingsNamespace as n } from "@deepseek-ai/dsh-settings";
//#region package.json
var r = "dsh-thrum";
//#endregion
//#region src/shared/identity.ts
function i() {
	return r;
}
//#endregion
//#region src/shared/config.ts
var a = [
	"off",
	"light",
	"medium",
	"strong"
], o = [
	"off",
	"low",
	"medium",
	"high"
], s = [
	"off",
	"ember",
	"blue",
	"spark"
], c = [
	"off",
	"ding",
	"chime",
	"pop"
], l = [
	{
		key: "enabled",
		kind: "boolean",
		def: !0
	},
	{
		key: "opacity",
		kind: "number",
		min: .1,
		max: 1,
		def: .5
	},
	{
		key: "moleFrequency",
		kind: "enum",
		values: o,
		def: "medium"
	},
	{
		key: "feedback",
		kind: "boolean",
		def: !0
	},
	{
		key: "flame",
		kind: "enum",
		values: s,
		def: "ember"
	},
	{
		key: "shake",
		kind: "enum",
		values: a,
		def: "off"
	},
	{
		key: "response",
		kind: "boolean",
		def: !0
	},
	{
		key: "pageShakeLevel",
		kind: "enum",
		values: a,
		def: "off"
	},
	{
		key: "sound",
		kind: "enum",
		values: c,
		def: "ding"
	}
];
l.map((e) => e.key), Object.fromEntries(l.map((e) => [e.key, e.def]));
//#endregion
//#region src/host/index.ts
var u = i(), d = n(i());
function f(t) {
	switch (t.kind) {
		case "boolean": return e.boolean().default(t.def);
		case "number": return e.number().min(t.min).max(t.max).default(t.def);
		case "enum": return e.union([...t.values]).default(t.def);
	}
}
var p = e.object(Object.fromEntries(l.map((e) => [e.key, f(e)])));
function m(e) {
	return "data: " + JSON.stringify(e) + "\n\n";
}
var h = {
	inject: ["webServer"],
	apply(e, n) {
		t(e, d, p, n, {
			setSource: () => {},
			onChange: () => {}
		});
		let r = /* @__PURE__ */ new Set();
		function i(e) {
			let t = m({ type: e });
			for (let e of r) try {
				e.write(t);
			} catch {}
		}
		e.on("session/event", (e, t) => {
			t && t.type === "turn/end" && i("answer-done");
		}), e.effect(() => {
			let t = e.webServer.register({
				kind: "exact",
				path: "/api/thrum-events",
				handler: (e, t) => {
					if (e.method !== "GET" && e.method !== "HEAD") {
						t.writeHead(405), t.end();
						return;
					}
					t.writeHead(200, {
						"content-type": "text/event-stream",
						"cache-control": "no-cache",
						connection: "keep-alive"
					}), t.write(": connected\n\n"), r.add(t), t.on("close", () => {
						r.delete(t);
					});
				}
			});
			return () => {
				t();
				for (let e of r) e.destroy();
				r.clear();
			};
		});
	}
};
//#endregion
export { p as Config, s as FLAME_STYLES, o as MOLE_FREQUENCIES, a as SHAKE_LEVELS, c as SOUND_STYLES, d as THRUM_SETTINGS_NAMESPACE, h as default, u as name };
