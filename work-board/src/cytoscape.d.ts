declare module "cytoscape" {
  type CytoscapeElement = {
    group: "nodes" | "edges";
    data: Record<string, unknown>;
  };

  type CytoscapeStyle = Array<{ selector: string; style: Record<string, string | number> }>;

  interface CytoscapeFactoryOptions {
    container: HTMLElement;
    elements: CytoscapeElement[];
    style: CytoscapeStyle;
    layout: { name: "cose"; animate: boolean; fit: boolean; padding: number };
  }

  interface CytoscapeCollection {
    addClass(className: string): CytoscapeCollection;
    removeClass(className: string): CytoscapeCollection;
    not(collection: CytoscapeCollection): CytoscapeCollection;
  }

  interface CytoscapeNode {
    id(): string;
    closedNeighborhood(): CytoscapeCollection;
    connectedEdges(): CytoscapeCollection;
  }

  interface CytoscapeCore {
    elements(): CytoscapeCollection;
    on(eventName: string, selector: string, handler: (event: { target: CytoscapeNode }) => void): void;
    destroy(): void;
  }

  interface CytoscapeFactory {
    (options: CytoscapeFactoryOptions): CytoscapeCore;
  }

  const cytoscape: CytoscapeFactory;
  export default cytoscape;
}
