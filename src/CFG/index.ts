import { first, Subject } from 'rxjs';
import typescript from 'typescript';

export type CFGNode = {
  _id: string;
  text: string;
};

export type CFGEdge = {
  begin: string;
  end: string;
};

export interface CFGBlock extends CFGNode {
  children: CFGData;
}

export interface CFGData {
  nodes: CFGNode[];
  edges: CFGEdge[];
  lastNodeIds: string[];
}

export function isCFGBlock(node: CFGNode): node is CFGBlock {
  return !!(node as CFGBlock).children;
}

export function generateCFG(statements: typescript.NodeArray<typescript.Statement> | undefined): {
  nodes: CFGNode[];
  edges: CFGEdge[];
  lastNodeIds: string[];
} {
  if (!statements) {
    return { nodes: [], edges: [], lastNodeIds: [] };
  }

  const nodes: CFGNode[] = [];
  const edges: CFGEdge[] = [];
  let lastNodeIds: string[] = [];

  const nextNodeId$ = new Subject<string>();

  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];

    lastNodeIds = [];

    const nodeId = statement.pos.toString();

    if (typescript.isExpressionStatement(statement)) {
      const expression = statement.expression;

      nodes.push({
        _id: nodeId,
        text: expression.getText(),
      });

      nextNodeId$.next(nodeId);
      nextNodeId$.pipe(first()).subscribe((nextId) => {
        edges.push({
          begin: nodeId,
          end: nextId,
        });
      });
      lastNodeIds.push(nodeId);
    }
    if (typescript.isFunctionDeclaration(statement) && statement.body) {
      const bodyStatements = statement.body.statements;
      const block: CFGBlock = {
        _id: nodeId,
        text: `function ${statement.name?.escapedText}`,
        children: generateCFG(bodyStatements),
      };

      nodes.push(block);
      nextNodeId$.next(nodeId);
      nextNodeId$.pipe(first()).subscribe((nextId) => {
        edges.push({
          begin: nodeId,
          end: nextId,
        });
      });
      lastNodeIds.push(nodeId);
    }
    if (typescript.isIfStatement(statement)) {
      nodes.push({
        _id: nodeId,
        text: statement.expression.getText(),
      });
      nextNodeId$.next(nodeId);

      const thenStatements = (statement.thenStatement as typescript.Block).statements;
      const { nodes: thenNodes, edges: thenEdges, lastNodeIds: thenLastNodeIds } = generateCFG(thenStatements);

      if (thenNodes.length) {
        nodes.push(...thenNodes);
        edges.push(...thenEdges);
        edges.push({
          begin: nodeId,
          end: thenNodes[0]._id,
        });
        nextNodeId$.pipe(first()).subscribe((nextId) => {
          thenLastNodeIds.forEach((thenLastNodeId) => {
            edges.push({
              begin: thenLastNodeId,
              end: nextId,
            });
          });
        });
        lastNodeIds.push(...thenLastNodeIds);
      }

      if (statement.elseStatement) {
        const elseStatements = (statement.elseStatement as typescript.Block).statements;
        const { nodes: elseNodes, edges: elseEdges, lastNodeIds: elseLastNodeIds } = generateCFG(elseStatements);

        if (elseNodes.length) {
          nodes.push(...elseNodes);
          edges.push(...elseEdges);
          edges.push({
            begin: nodeId,
            end: elseNodes[0]._id,
          });
          nextNodeId$.pipe(first()).subscribe((nextId) => {
            elseLastNodeIds.forEach((elseLastNodeId) => {
              edges.push({
                begin: elseLastNodeId,
                end: nextId,
              });
            });
          });
          lastNodeIds.push(...elseLastNodeIds);
        }
      }
    }
  }

  nextNodeId$.complete();
  return { nodes, edges, lastNodeIds };
}