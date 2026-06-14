import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK = `<svg width="120" height="120" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="t"><rect width="32" height="32" rx="8"/></clipPath></defs><g clip-path="url(#t)"><rect width="32" height="32" fill="#0B7A3F"/><rect width="7.5" height="32" fill="#CE1126"/></g><path d="M12.5 16.6l3.4 3.5 7.2-8.2" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#14171C",
        }}
      >
        <img
          width="120"
          height="120"
          alt="Revora"
          src={`data:image/svg+xml;utf8,${encodeURIComponent(MARK)}`}
        />
      </div>
    ),
    size,
  );
}
