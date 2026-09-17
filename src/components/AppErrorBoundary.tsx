import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      showDetails: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[AppErrorBoundary caught an error]:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      const isRtl = typeof document !== "undefined" ? document.dir === "rtl" : true;
      const errorMsg = this.state.error?.message || "Unknown error";

      return (
        <div className="my-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5 text-foreground shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
              <AlertTriangle className="size-5" />
            </div>

            <div className="flex-1 space-y-2">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-destructive">
                  {this.props.fallbackTitle ||
                    (isRtl
                      ? "حدث خطأ غير متوقع في هذا القسم"
                      : "An unexpected error occurred in this section")}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRtl
                    ? "تم حصر الخطأ بنجاح لحماية باقي المنظومة دون الحاجة لتسجيل الخروج أو مسح الكاش."
                    : "The error was safely isolated to protect the rest of the application."}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={this.handleReset}
                  className="h-8 gap-1.5 text-xs font-semibold bg-brand text-white hover:bg-brand/90"
                >
                  <RefreshCw className="size-3.5" />
                  <span>{isRtl ? "إعادة المحاولة" : "Try Again"}</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = "/";
                    }
                  }}
                  className="h-8 gap-1.5 text-xs font-semibold"
                >
                  <Home className="size-3.5" />
                  <span>{isRtl ? "العودة للوحة الرئيسية" : "Go to Dashboard"}</span>
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={this.toggleDetails}
                  className="h-8 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <span>{isRtl ? "التفاصيل التقنية" : "Technical Details"}</span>
                  {this.state.showDetails ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </Button>
              </div>

              {/* Collapsible Technical Error Information */}
              {this.state.showDetails && (
                <div className="mt-2 rounded-lg bg-background/90 p-3 font-mono text-[11px] text-destructive border border-destructive/20 overflow-x-auto whitespace-pre-wrap">
                  <div className="font-bold">{errorMsg}</div>
                  {this.state.error?.stack && (
                    <div className="mt-1 text-[10px] text-muted-foreground max-h-36 overflow-y-auto">
                      {this.state.error.stack}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
