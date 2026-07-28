import { j as jsxRuntimeExports } from "./react-BhVOh7S1.js";
import { c as useParams, L as Link } from "./router-CJAaEV1m.js";
import { R as ROUTES } from "./index-B3A6tzhN.js";
import "./react-dom-BqzW1rgF.js";
import "./vendor-Bz22r_8Z.js";
function GamePage() {
  const { roomId } = useParams();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "game-page", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: ROUTES.landing, className: "back-link", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "←" }),
      " Quay lại"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Sân chơi" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
      "Phòng: ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: roomId })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Trò chơi đang được phát triển. Quay lại lobby để chờ thêm người." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: ROUTES.lobby, children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", children: "Về phòng chờ" }) })
  ] });
}
export {
  GamePage as default
};
