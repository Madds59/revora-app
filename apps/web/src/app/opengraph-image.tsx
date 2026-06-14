import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Revora — Built on Trust. Powered by Operations.";

const MARK = `<svg width="96" height="96" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="t"><rect width="32" height="32" rx="8"/></clipPath></defs><g clip-path="url(#t)"><rect width="32" height="32" fill="#0B7A3F"/><rect width="7.5" height="32" fill="#CE1126"/></g><path d="M12.5 16.6l3.4 3.5 7.2-8.2" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "80px",
          justifyContent: "space-between",
          background: "#14171C",
          color: "#F4F5F3",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <img
            width="96"
            height="96"
            alt="Revora"
            src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`}
          />
          <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1 }}>
            Revora
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: -1 }}>
            Built on Trust.
            <br />
            Powered by Operations.
          </span>
          <span style={{ fontSize: 28, color: "#A7ACA4" }}>
            Customer trust & operations for service businesses.
          </span>
        </div>

        {/* UAE-flag accent rule */}
        <div style={{ display: "flex", height: "10px", width: "320px" }}>
          <div style={{ flex: "0 0 12%", background: "#CE1126" }} />
          <div style={{ flex: "0 0 29%", background: "#0B7A3F" }} />
          <div style={{ flex: "0 0 29%", background: "#FFFFFF" }} />
          <div style={{ flex: "0 0 30%", background: "#0C0E12" }} />
        </div>
      </div>
    ),
    size,
  );
}
