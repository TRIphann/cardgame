// ErrorBoundary — catches render-phase errors so a single broken component
// doesn't blank the whole app. We log to console AND show a recovery UI.

import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("[arcana] ErrorBoundary caught:", error, info);
  }

  reset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="arc-error-screen">
          <h1>Có lỗi xảy ra.</h1>
          <p>{String(this.state.error?.message || this.state.error)}</p>
          {this.state.info?.componentStack && (
            <pre className="arc-error-screen__stack">
              {this.state.info.componentStack}
            </pre>
          )}
          <button type="button" onClick={this.reset}>Thử lại</button>
        </div>
      );
    }
    return this.props.children;
  }
}