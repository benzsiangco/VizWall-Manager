import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: "fixed", inset: 0,
          background: "#08070d", color: "#fff",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "2rem", fontFamily: "monospace",
          gap: "1rem"
        }}>
          <div style={{ color: "#f87171", fontSize: "14px", fontWeight: "bold" }}>
            VizWall failed to start
          </div>
          <div style={{
            background: "#1a1825", borderRadius: "8px",
            padding: "1rem", maxWidth: "600px", width: "100%",
            fontSize: "11px", color: "#a78bfa", whiteSpace: "pre-wrap",
            wordBreak: "break-all", maxHeight: "300px", overflow: "auto"
          }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
