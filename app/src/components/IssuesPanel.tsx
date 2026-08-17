import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ConversionIssue } from "../../../src/core/convert/validate";

interface IssuesPanelProps {
  issues: ConversionIssue[];
}

/**
 * Panel de validación: lista los problemas detectados en el beatmap convertido.
 */
export function IssuesPanel({ issues }: IssuesPanelProps) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <section className="issues-panel">
      <h2>Problemas detectados</h2>
      {issues.length === 0 ? (
        <p className="issues-empty">
          <CheckCircle2 size={16} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />
          Sin problemas detectados en la conversión.
        </p>
      ) : (
        <ul className="issues-list">
          {errors.map((issue, index) => (
            <IssueRow key={`error-${index}`} issue={issue} />
          ))}
          {warnings.map((issue, index) => (
            <IssueRow key={`warning-${index}`} issue={issue} />
          ))}
        </ul>
      )}
    </section>
  );
}

interface IssueRowProps {
  issue: ConversionIssue;
}

/** Una fila de problema de validación con su severidad, mensaje y tiempo. */
function IssueRow({ issue }: IssueRowProps) {
  const isError = issue.severity === "error";
  return (
    <li className={`issue-row issue-row--${isError ? "error" : "warning"}`}>
      <span className="issue-severity">
        {isError ? (
          <AlertCircle size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
        ) : (
          <AlertTriangle size={13} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 4 }} />
        )}
        {isError ? "Error" : "Advertencia"}
      </span>
      <span className="issue-message">{issue.message}</span>
      {issue.timeMs !== null && <span className="issue-time mono">{issue.timeMs} ms</span>}
    </li>
  );
}
