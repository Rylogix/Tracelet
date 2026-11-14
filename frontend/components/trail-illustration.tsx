import { AtSign, Globe, Mail, FileSearch, ScanLine } from "lucide-react";
import { TraceMark } from "./brand";
export function TrailIllustration() {
  return (
    <div className="trail-illustration" aria-hidden="true">
      <div className="trail-grid" />
      <svg className="trail-connections" viewBox="0 0 620 340" fill="none">
        <path
          d="M310 170 116 91M310 170 501 77M310 170 492 268M310 170 104 265"
          stroke="url(#trail-line)"
          strokeWidth="1.2"
          strokeDasharray="4 6"
        />
        <defs>
          <linearGradient id="trail-line">
            <stop stopColor="#9a9a9a" stopOpacity=".1" />
            <stop offset=".5" stopColor="#9a9a9a" stopOpacity=".7" />
            <stop offset="1" stopColor="#9a9a9a" stopOpacity=".1" />
          </linearGradient>
        </defs>
        <circle
          cx="310"
          cy="170"
          r="106"
          stroke="#989898"
          strokeOpacity=".08"
        />
        <circle
          cx="310"
          cy="170"
          r="149"
          stroke="#989898"
          strokeOpacity=".08"
        />
      </svg>
      <div className="trail-center">
        <TraceMark />
        <span className="trail-center-glow" />
      </div>
      <span className="trail-node node-username">
        <AtSign size={17} />
        <span>Username</span>
        <span className="node-dot" />
      </span>
      <span className="trail-node node-website">
        <Globe size={17} />
        <span>Website</span>
        <span className="node-dot" />
      </span>
      <span className="trail-node node-email">
        <Mail size={17} />
        <span>Email</span>
        <span className="node-dot" />
      </span>
      <span className="trail-node node-file">
        <FileSearch size={17} />
        <span>Files</span>
        <span className="node-dot" />
      </span>
      <span className="trail-caption">
        <ScanLine size={12} />
        Public information
      </span>
    </div>
  );
}
