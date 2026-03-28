import { type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { type JSX } from "react";
type GenericIssueTabProps = {
    context?: {
        companyId?: string | null;
        companyPrefix?: string | null;
    };
    issueId?: string;
    selectedIssueId?: string;
    issue?: {
        id?: string;
        identifier?: string | null;
        title?: string;
        status?: string;
    };
    issues?: Array<{
        id?: string;
        identifier?: string | null;
    }>;
    issueIds?: string[];
};
export declare function ServiceRequestBridgeListTab(props: GenericIssueTabProps): JSX.Element;
export declare function ServiceRequestBridgeDetailTab(props: GenericIssueTabProps): JSX.Element;
export declare function BridgeDashboardWidget({ context }: PluginWidgetProps): JSX.Element;
export declare function BridgeSidebarLink({ context }: {
    context: {
        companyPrefix?: string | null;
    };
}): import("react/jsx-runtime").JSX.Element;
export {};
