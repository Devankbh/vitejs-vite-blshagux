import { useState, useRef, useCallback } from 'react';
import { extractFromFile } from './api';
type Confidence = 'high' | 'medium' | 'low' | 'unmapped';

interface TreeNode {
  id: string;
  label: string;
  value?: string;
  confidence: number;
  status: Confidence;
  children?: TreeNode[];
  bbox?: { x: number; y: number; w: number; h: number; page: number };
  corrected?: boolean;
  newPoint?: boolean;
}

interface MappingRule {
  cell: string;
  fieldId: string;
  fieldLabel: string;
  value: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  event: string;
  field: string;
  originalValue?: string;
  newValue?: string;
  method?: string;
  analyst: string;
}

const SAMPLE_TREE: TreeNode[] = [
  {
    id: 'bs',
    label: 'Balance Sheet',
    confidence: 1,
    status: 'high',
    children: [
      {
        id: 'assets',
        label: 'Assets',
        confidence: 1,
        status: 'high',
        children: [
          {
            id: 'ca',
            label: 'Current Assets',
            confidence: 1,
            status: 'high',
            children: [
              {
                id: 'cash',
                label: 'Cash & Equivalents',
                value: '4,20,00,000',
                confidence: 0.97,
                status: 'high',
                bbox: { x: 120, y: 180, w: 280, h: 28, page: 1 },
              },
              {
                id: 'rec',
                label: 'Trade Receivables',
                value: '2,10,00,000',
                confidence: 0.71,
                status: 'medium',
                bbox: { x: 120, y: 215, w: 280, h: 28, page: 1 },
              },
              {
                id: 'inv',
                label: 'Inventory',
                value: '1,80,00,000',
                confidence: 0.68,
                status: 'medium',
                bbox: { x: 120, y: 250, w: 280, h: 28, page: 1 },
              },
              {
                id: 'cwip',
                label: 'CWIP',
                value: '60,00,000',
                confidence: 0.38,
                status: 'low',
                bbox: { x: 120, y: 285, w: 280, h: 28, page: 1 },
              },
              {
                id: 'unmapped1',
                label: 'Deferred Tax Asset',
                value: '23,00,000',
                confidence: 0,
                status: 'unmapped',
                bbox: { x: 120, y: 320, w: 280, h: 28, page: 1 },
              },
            ],
          },
          {
            id: 'nca',
            label: 'Non-Current Assets',
            confidence: 1,
            status: 'high',
            children: [
              {
                id: 'ppe',
                label: 'Property Plant & Equipment',
                value: '8,50,00,000',
                confidence: 0.94,
                status: 'high',
                bbox: { x: 120, y: 380, w: 280, h: 28, page: 1 },
              },
              {
                id: 'intang',
                label: 'Intangible Assets',
                value: '1,20,00,000',
                confidence: 0.82,
                status: 'medium',
                bbox: { x: 120, y: 415, w: 280, h: 28, page: 1 },
              },
            ],
          },
        ],
      },
      {
        id: 'liab',
        label: 'Liabilities',
        confidence: 1,
        status: 'high',
        children: [
          {
            id: 'std',
            label: 'Short-term Debt',
            value: '3,10,00,000',
            confidence: 0.94,
            status: 'high',
            bbox: { x: 120, y: 490, w: 280, h: 28, page: 2 },
          },
          {
            id: 'ltd',
            label: 'Long-term Debt',
            value: '5,20,00,000',
            confidence: 0.89,
            status: 'medium',
            bbox: { x: 120, y: 525, w: 280, h: 28, page: 2 },
          },
          {
            id: 'ap',
            label: 'Accounts Payable',
            value: '1,40,00,000',
            confidence: 0.76,
            status: 'medium',
            bbox: { x: 120, y: 560, w: 280, h: 28, page: 2 },
          },
        ],
      },
      {
        id: 'equity',
        label: 'Equity',
        confidence: 1,
        status: 'high',
        children: [
          {
            id: 'sc',
            label: 'Share Capital',
            value: '2,00,00,000',
            confidence: 0.96,
            status: 'high',
            bbox: { x: 120, y: 630, w: 280, h: 28, page: 2 },
          },
          {
            id: 're',
            label: 'Retained Earnings',
            value: '6,80,00,000',
            confidence: 0.91,
            status: 'high',
            bbox: { x: 120, y: 665, w: 280, h: 28, page: 2 },
          },
        ],
      },
    ],
  },
  {
    id: 'pl',
    label: 'Profit & Loss',
    confidence: 1,
    status: 'high',
    children: [
      {
        id: 'rev',
        label: 'Total Revenue',
        value: '18,40,00,000',
        confidence: 0.95,
        status: 'high',
        bbox: { x: 120, y: 160, w: 280, h: 28, page: 3 },
      },
      {
        id: 'cogs',
        label: 'Cost of Goods Sold',
        value: '11,20,00,000',
        confidence: 0.88,
        status: 'medium',
        bbox: { x: 120, y: 195, w: 280, h: 28, page: 3 },
      },
      {
        id: 'gp',
        label: 'Gross Profit',
        value: '7,20,00,000',
        confidence: 0.93,
        status: 'high',
        bbox: { x: 120, y: 230, w: 280, h: 28, page: 3 },
      },
      {
        id: 'ebitda',
        label: 'EBITDA',
        value: '4,10,00,000',
        confidence: 0.44,
        status: 'low',
        bbox: { x: 120, y: 265, w: 280, h: 28, page: 3 },
      },
      {
        id: 'pat',
        label: 'Profit After Tax',
        value: '2,30,00,000',
        confidence: 0.91,
        status: 'high',
        bbox: { x: 120, y: 300, w: 280, h: 28, page: 3 },
      },
    ],
  },
];

const EXCEL_TEMPLATE = [
  { cell: 'B3', label: 'Company Name', fieldId: '' },
  { cell: 'B4', label: 'Assessment Date', fieldId: '' },
  { cell: 'B7', label: 'Cash & Equivalents', fieldId: 'cash' },
  { cell: 'B8', label: 'Trade Receivables', fieldId: 'rec' },
  { cell: 'B9', label: 'Inventory', fieldId: 'inv' },
  { cell: 'B10', label: 'CWIP', fieldId: 'cwip' },
  { cell: 'B11', label: 'Deferred Tax Asset', fieldId: 'unmapped1' },
  { cell: 'B13', label: 'PP&E', fieldId: 'ppe' },
  { cell: 'B14', label: 'Intangible Assets', fieldId: 'intang' },
  { cell: 'B17', label: 'Short-term Debt', fieldId: 'std' },
  { cell: 'B18', label: 'Long-term Debt', fieldId: 'ltd' },
  { cell: 'B19', label: 'Accounts Payable', fieldId: 'ap' },
  { cell: 'B22', label: 'Share Capital', fieldId: 'sc' },
  { cell: 'B23', label: 'Retained Earnings', fieldId: 're' },
  { cell: 'B26', label: 'Total Revenue', fieldId: 'rev' },
  { cell: 'B27', label: 'Cost of Goods Sold', fieldId: 'cogs' },
  { cell: 'B28', label: 'Gross Profit', fieldId: 'gp' },
  { cell: 'B29', label: 'EBITDA', fieldId: 'ebitda' },
  { cell: 'B30', label: 'Profit After Tax', fieldId: 'pat' },
];

const flattenTree = (nodes: TreeNode[]): TreeNode[] => {
  const result: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    if (n.value !== undefined) result.push(n);
    n.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return result;
};

const updateNode = (
  nodes: TreeNode[],
  id: string,
  patch: Partial<TreeNode>
): TreeNode[] =>
  nodes.map((n) =>
    n.id === id
      ? { ...n, ...patch }
      : {
          ...n,
          children: n.children ? updateNode(n.children, id, patch) : undefined,
        }
  );

const now = () =>
  new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const Badge = ({
  status,
  confidence,
}: {
  status: Confidence;
  confidence: number;
}) => {
  const map = {
    high: {
      bg: '#052e16',
      color: '#4ade80',
      label: `${Math.round(confidence * 100)}%`,
    },
    medium: {
      bg: '#431407',
      color: '#fb923c',
      label: `${Math.round(confidence * 100)}%`,
    },
    low: {
      bg: '#450a0a',
      color: '#f87171',
      label: `${Math.round(confidence * 100)}%`,
    },
    unmapped: { bg: '#1e1b4b', color: '#a78bfa', label: 'UNMAPPED' },
  };
  const s = map[status];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 4,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {status === 'high'
        ? '✅'
        : status === 'medium'
        ? '⚠'
        : status === 'low'
        ? '❌'
        : '?'}{' '}
      {s.label}
    </span>
  );
};

const TreeItem = ({
  node,
  depth,
  selected,
  onSelect,
  onRightClick,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (n: TreeNode) => void;
  onRightClick: (n: TreeNode, e: React.MouseEvent) => void;
}) => {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selected === node.id;

  return (
    <div>
      <div
        onClick={() => {
          if (hasChildren) setOpen((o) => !o);
          if (node.value !== undefined) onSelect(node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onRightClick(node, e);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          paddingLeft: 8 + depth * 16,
          background: isSelected ? '#1e3a5f' : 'transparent',
          borderLeft: isSelected
            ? '2px solid #60a5fa'
            : '2px solid transparent',
          cursor: 'pointer',
          borderRadius: 4,
          marginBottom: 1,
        }}
      >
        {hasChildren ? (
          <span style={{ color: '#64748b', fontSize: 10, width: 12 }}>
            {open ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: 12, display: 'inline-block' }} />
        )}
        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: node.value !== undefined ? '#e2e8f0' : '#94a3b8',
            fontWeight: node.value !== undefined ? 400 : 600,
          }}
        >
          {node.label}
          {node.corrected && (
            <span style={{ color: '#34d399', fontSize: 11, marginLeft: 6 }}>
              ✓ corrected
            </span>
          )}
          {node.newPoint && (
            <span style={{ color: '#a78bfa', fontSize: 11, marginLeft: 6 }}>
              ★ new
            </span>
          )}
        </span>
        {node.value !== undefined && (
          <>
            <span
              style={{
                fontSize: 12,
                color: '#cbd5e1',
                marginRight: 6,
                fontFamily: 'monospace',
              }}
            >
              {node.value}
            </span>
            <Badge status={node.status} confidence={node.confidence} />
          </>
        )}
      </div>
      {hasChildren &&
        open &&
        node.children?.map((c) => (
          <TreeItem
            key={c.id}
            node={c}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
            onRightClick={onRightClick}
          />
        ))}
    </div>
  );
};
const PDFViewer = ({
  highlight,
  page,
}: {
  highlight: TreeNode | null;
  page: number;
}) => {
  const pages: Record<number, [string, string][]> = {
    1: [
      ['BALANCE SHEET AS AT 31 MARCH 2025', ''],
      ['ASSETS', ''],
      ['Current Assets', ''],
      ['Cash & Equivalents', '4,20,00,000'],
      ['Trade Receivables', '2,10,00,000'],
      ['Inventory', '1,80,00,000'],
      ['CWIP', '60,00,000'],
      ['Deferred Tax Asset', '23,00,000'],
      ['Non-Current Assets', ''],
      ['Property Plant & Equipment', '8,50,00,000'],
      ['Intangible Assets', '1,20,00,000'],
    ],
    2: [
      ['LIABILITIES & EQUITY', ''],
      ['Current Liabilities', ''],
      ['Short-term Debt', '3,10,00,000'],
      ['Long-term Debt', '5,20,00,000'],
      ['Accounts Payable', '1,40,00,000'],
      ['Equity', ''],
      ['Share Capital', '2,00,00,000'],
      ['Retained Earnings', '6,80,00,000'],
    ],
    3: [
      ['PROFIT & LOSS STATEMENT FY 2025', ''],
      ['Total Revenue', '18,40,00,000'],
      ['Cost of Goods Sold', '11,20,00,000'],
      ['Gross Profit', '7,20,00,000'],
      ['EBITDA', '4,10,00,000'],
      ['Profit After Tax', '2,30,00,000'],
    ],
  };
  const rows = pages[page] || pages[1];
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 4,
        padding: 24,
        height: '100%',
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#111',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          marginBottom: 12,
          fontSize: 10,
          color: '#666',
          borderBottom: '1px solid #ddd',
          paddingBottom: 8,
        }}
      >
        Page {page} of 3 — Financial Statement FY 2024-25
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map(([label, value], i) => {
            const isHighlighted =
              highlight?.label === label && highlight?.bbox?.page === page;
            const isHeader = value === '';
            return (
              <tr
                key={i}
                style={{
                  background: isHighlighted ? '#fef08a' : 'transparent',
                  transition: 'background 0.3s',
                }}
              >
                <td
                  style={{
                    padding: '4px 8px',
                    fontWeight: isHeader ? 700 : 400,
                    paddingLeft: isHeader ? 0 : 16,
                    fontSize: 11,
                  }}
                >
                  {isHighlighted && (
                    <span style={{ color: '#d97706', marginRight: 4 }}>►</span>
                  )}
                  {label}
                </td>
                <td
                  style={{
                    padding: '4px 8px',
                    textAlign: 'right',
                    fontWeight: isHighlighted ? 700 : 400,
                    color: isHighlighted ? '#92400e' : '#111',
                  }}
                >
                  {value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const ExcelPreview = ({
  tree,
  mappings,
  dragOver,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  tree: TreeNode[];
  mappings: MappingRule[];
  dragOver: string | null;
  onDrop: (cell: string, fieldId: string) => void;
  onDragOver: (cell: string) => void;
  onDragLeave: () => void;
}) => {
  const flat = flattenTree(tree);
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 4,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: '#217346',
          color: 'white',
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>CAM Template — FY 2024-25</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.8 }}>
          Drag tree items here to map
        </span>
      </div>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
      >
        <thead>
          <tr style={{ background: '#d5e8d4' }}>
            <th
              style={{
                width: 40,
                padding: '4px 8px',
                borderRight: '1px solid #ccc',
                color: '#666',
                fontWeight: 400,
                fontSize: 11,
              }}
            >
              #
            </th>
            <th
              style={{
                padding: '4px 8px',
                textAlign: 'left',
                borderRight: '1px solid #ccc',
                color: '#666',
                fontWeight: 400,
                fontSize: 11,
              }}
            >
              Field
            </th>
            <th
              style={{
                padding: '4px 8px',
                textAlign: 'left',
                color: '#666',
                fontWeight: 400,
                fontSize: 11,
              }}
            >
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {EXCEL_TEMPLATE.map(({ cell, label, fieldId }, i) => {
            const node = fieldId ? flat.find((n) => n.id === fieldId) : null;
            const autoVal = node?.value || null;
            const manualRule = mappings.find((m) => m.cell === cell);
            const displayVal = manualRule?.value || autoVal;
            const isOver = dragOver === cell;
            const rowNum = parseInt(cell.slice(1));
            const isSection = [5, 6, 12, 15, 16, 21, 24, 25].includes(rowNum);
            return (
              <tr
                key={cell}
                style={{
                  background: isSection
                    ? '#e8f4e8'
                    : isOver
                    ? '#fef9c3'
                    : i % 2 === 0
                    ? '#fafafa'
                    : '#fff',
                  borderBottom: '1px solid #e5e7eb',
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isSection) onDragOver(cell);
                }}
                onDragLeave={onDragLeave}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('fieldId');
                  if (id && !isSection) onDrop(cell, id);
                }}
              >
                <td
                  style={{
                    padding: '3px 8px',
                    borderRight: '1px solid #ddd',
                    color: '#999',
                    fontSize: 10,
                    textAlign: 'center',
                  }}
                >
                  {rowNum}
                </td>
                <td
                  style={{
                    padding: '3px 8px',
                    borderRight: '1px solid #ddd',
                    fontWeight: isSection ? 700 : 400,
                    color: isSection ? '#166534' : '#374151',
                  }}
                >
                  {label}
                </td>
                <td
                  style={{
                    padding: '3px 8px',
                    background: isOver
                      ? '#fef08a'
                      : displayVal
                      ? '#f0fdf4'
                      : fieldId
                      ? '#fef2f2'
                      : '#f9fafb',
                    color: displayVal ? '#166534' : '#ef4444',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    minHeight: 24,
                  }}
                >
                  {displayVal || (fieldId && !isSection ? '← drop here' : '')}
                  {isOver && !displayVal && (
                    <span style={{ color: '#d97706' }}> drop!</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
const AuditLog = ({ entries }: { entries: AuditEntry[] }) => (
  <div
    style={{
      background: '#0f172a',
      borderRadius: 6,
      padding: 16,
      height: '100%',
      overflowY: 'auto',
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#64748b',
        marginBottom: 12,
        letterSpacing: 1,
        textTransform: 'uppercase' as const,
      }}
    >
      Audit Trail — {entries.length} events
    </div>
    {entries.length === 0 && (
      <div
        style={{
          color: '#334155',
          fontSize: 12,
          textAlign: 'center',
          marginTop: 40,
        }}
      >
        No events yet. Start reviewing.
      </div>
    )}
    {[...entries].reverse().map((e) => (
      <div
        key={e.id}
        style={{
          borderLeft: '2px solid #1e40af',
          paddingLeft: 10,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa' }}>
            {e.event}
          </span>
          <span style={{ fontSize: 10, color: '#475569' }}>{e.timestamp}</span>
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          Field: <span style={{ color: '#e2e8f0' }}>{e.field}</span>
        </div>
        {e.originalValue && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Before: <span style={{ color: '#f87171' }}>{e.originalValue}</span>
          </div>
        )}
        {e.newValue && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            After: <span style={{ color: '#4ade80' }}>{e.newValue}</span>
          </div>
        )}
        {e.method && (
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Method: <span style={{ color: '#a78bfa' }}>{e.method}</span>
          </div>
        )}
        <div style={{ fontSize: 10, color: '#475569' }}>by {e.analyst}</div>
      </div>
    ))}
  </div>
);
export default function App() {
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  const [tree, setTree] = useState<TreeNode[]>(SAMPLE_TREE);
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [filter, setFilter] = useState<
    'all' | 'high' | 'medium' | 'low' | 'unmapped'
  >('all');
  const [contextMenu, setContextMenu] = useState<{
    node: TreeNode;
    x: number;
    y: number;
  } | null>(null);
  const [editModal, setEditModal] = useState<TreeNode | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newPointModal, setNewPointModal] = useState<TreeNode | null>(null);
  const [newPointName, setNewPointName] = useState('');
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [mappings, setMappings] = useState<MappingRule[]>([]);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [dragNode, setDragNode] = useState<TreeNode | null>(null);
  const [exported, setExported] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const auditIdRef = useRef(0);

  const addAudit = useCallback(
    (entry: Omit<AuditEntry, 'id' | 'timestamp' | 'analyst'>) => {
      setAudit((a) => [
        ...a,
        {
          ...entry,
          id: String(++auditIdRef.current),
          timestamp: now(),
          analyst: 'Agent — Perfios',
        },
      ]);
    },
    []
  );

  const flat = flattenTree(tree);
  const stats = {
    total: flat.length,
    high: flat.filter((n) => n.status === 'high').length,
    medium: flat.filter((n) => n.status === 'medium').length,
    low: flat.filter((n) => n.status === 'low').length,
    unmapped: flat.filter((n) => n.status === 'unmapped').length,
  };
  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    addAudit({ event: 'DOCUMENT_UPLOADED', field: file.name });
    try {
      const result = await extractFromFile(file);
      if (result.error) {
        setUploadError(result.error);
      } else {
        setTree(result.tree as any);
        addAudit({
          event: 'EXTRACTION_COMPLETE',
          field: file.name,
          newValue: result.tree.length + ' sections extracted',
        });
      }
    } catch (err) {
      setUploadError(String(err));
    }
    setUploading(false);
  };

  const handleSelect = (node: TreeNode) => {
    setSelected(node);
    if (node.bbox) setPdfPage(node.bbox.page);
    addAudit({ event: 'ITEM_VIEWED', field: node.label });
  };

  const handleCorrection = (node: TreeNode, newVal: string) => {
    const oldVal = node.value || '';
    setTree((t) =>
      updateNode(t, node.id, {
        value: newVal,
        confidence: 1,
        status: 'high',
        corrected: true,
      })
    );
    addAudit({
      event: 'CORRECTION',
      field: node.label,
      originalValue: oldVal,
      newValue: newVal,
      method: 'manual_edit',
    });
    setEditModal(null);
  };

  const handleNewPoint = (node: TreeNode, name: string) => {
    setTree((t) =>
      updateNode(t, node.id, {
        label: name,
        status: 'high',
        confidence: 1,
        newPoint: true,
      })
    );
    addAudit({
      event: 'NEW_TAXONOMY_POINT',
      field: name,
      newValue: node.value || '',
      method: 'right_click_create',
    });
    setNewPointModal(null);
    setNewPointName('');
  };

  const handleDrop = (cell: string, fieldId: string) => {
    const node = flat.find((n) => n.id === fieldId);
    if (!node) return;
    const existing = mappings.find((m) => m.cell === cell);
    setMappings((m) => [
      ...m.filter((x) => x.cell !== cell),
      { cell, fieldId, fieldLabel: node.label, value: node.value || '' },
    ]);
    addAudit({
      event: 'TEMPLATE_MAPPED',
      field: node.label,
      newValue: 'cell ' + cell,
      method: existing ? 'remapped' : 'drag_drop',
    });
    setDragOverCell(null);
  };

  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    if (filter === 'all') return nodes;
    return nodes.reduce<TreeNode[]>((acc, n) => {
      const filteredChildren = n.children ? filterTree(n.children) : undefined;
      const match = n.value !== undefined && n.status === filter;
      if (match || (filteredChildren && filteredChildren.length > 0)) {
        acc.push({ ...n, children: filteredChildren });
      }
      return acc;
    }, []);
  };

  const displayTree = filterTree(tree);

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        background: '#060d1a',
        minHeight: '100vh',
        color: '#e2e8f0',
      }}
      onClick={() => setContextMenu(null)}
    >
      <div
        style={{
          background: '#0d1b2e',
          borderBottom: '1px solid #1e3a5f',
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: 'linear-gradient(135deg, #1d4ed8, #0891b2)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              color: 'white',
              fontWeight: 700,
            }}
          >
            P
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
            Perfios
          </span>
          <span style={{ color: '#334155', fontSize: 13 }}>/ AI Spreading</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(
            [
              { n: 1, label: '01 Extract & Verify' },
              { n: 2, label: '02 Map Template' },
              { n: 3, label: '03 Export' },
            ] as const
          ).map(({ n, label }) => (
            <button
              key={n}
              onClick={() => setScreen(n)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                background: screen === n ? '#1d4ed8' : '#1a2744',
                color: screen === n ? '#fff' : '#64748b',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginLeft: 16 }}>
          {(['high', 'medium', 'low', 'unmapped'] as const).map((s) => {
            const colors = {
              high: '#4ade80',
              medium: '#fb923c',
              low: '#f87171',
              unmapped: '#a78bfa',
            };
            const count = stats[s];
            return (
              <span key={s} style={{ fontSize: 11, color: colors[s] }}>
                {count} {s}
              </span>
            );
          })}
        </div>
      </div>

      {screen === 1 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: 'auto 1fr',
            height: 'calc(100vh - 53px)',
          }}
        >
          <div
            style={{
              gridColumn: '1 / -1',
              background: '#0d1b2e',
              borderBottom: '1px solid #1a2744',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, color: '#475569' }}>FILTER:</span>
            {(['all', 'high', 'medium', 'low', 'unmapped'] as const).map(
              (f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    background: filter === f ? '#1d4ed8' : '#1a2744',
                    color: filter === f ? '#fff' : '#64748b',
                  }}
                >
                  {f.toUpperCase()}
                  {f !== 'all' ? ' (' + stats[f] + ')' : ''}
                </button>
              )
            )}
            <span
              style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}
            >
              Click field to highlight in PDF | Right-click to edit or add
              taxonomy point
            </span>
          </div>

          <div
            style={{
              background: '#0a1628',
              borderRight: '1px solid #1a2744',
              overflowY: 'auto',
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#475569',
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid #1a2744',
                textTransform: 'uppercase' as const,
                letterSpacing: 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span>EXTRACTED DATA — {stats.total} fields</span>
                <label
                  style={{
                    cursor: 'pointer',
                    background: uploading ? '#1a2744' : '#1d4ed8',
                    color: uploading ? '#475569' : 'white',
                    padding: '4px 12px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {uploading ? 'Processing...' : 'Upload PDF / Image'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                  />
                </label>
              </div>
              {uploadError && (
                <div style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>
                  {uploadError}
                </div>
              )}
            </div>
            {displayTree.map((n) => (
              <TreeItem
                key={n.id}
                node={n}
                depth={0}
                selected={selected?.id || null}
                onSelect={handleSelect}
                onRightClick={(node, e) => {
                  e.preventDefault();
                  setContextMenu({ node, x: e.clientX, y: e.clientY });
                }}
              />
            ))}
          </div>

          <div
            style={{
              background: '#1a1a2e',
              display: 'flex',
              flexDirection: 'column' as const,
            }}
          >
            <div
              style={{
                background: '#0d1b2e',
                borderBottom: '1px solid #1a2744',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>
                DOCUMENT — PAGE
              </span>
              {[1, 2, 3].map((p) => (
                <button
                  key={p}
                  onClick={() => setPdfPage(p)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    background: pdfPage === p ? '#1d4ed8' : '#1a2744',
                    color: pdfPage === p ? '#fff' : '#64748b',
                  }}
                >
                  {p}
                </button>
              ))}
              {selected && (
                <span
                  style={{ marginLeft: 'auto', fontSize: 11, color: '#60a5fa' }}
                >
                  Selected: {selected.label}
                </span>
              )}
            </div>
            <div style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
              <PDFViewer highlight={selected} page={pdfPage} />
            </div>
          </div>
        </div>
      )}

      {screen === 2 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            height: 'calc(100vh - 53px)',
          }}
        >
          <div
            style={{
              background: '#0a1628',
              borderRight: '1px solid #1a2744',
              overflowY: 'auto',
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#475569',
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid #1a2744',
                textTransform: 'uppercase' as const,
                letterSpacing: 1,
              }}
            >
              Verified Data — drag to template
            </div>
            {flat.map((node) => {
              const isMapped =
                mappings.find((m) => m.fieldId === node.id) ||
                EXCEL_TEMPLATE.find((t) => t.fieldId === node.id);
              return (
                <div
                  key={node.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('fieldId', node.id);
                    setDragNode(node);
                  }}
                  onDragEnd={() => setDragNode(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    marginBottom: 3,
                    borderRadius: 6,
                    background:
                      dragNode?.id === node.id
                        ? '#1e3a5f'
                        : isMapped
                        ? '#052e16'
                        : '#0f1f38',
                    border: isMapped
                      ? '1px solid #166534'
                      : '1px solid #1a2744',
                    cursor: 'grab',
                  }}
                >
                  <span style={{ fontSize: 10, color: '#475569' }}>⠿</span>
                  <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0' }}>
                    {node.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#94a3b8',
                      fontFamily: 'monospace',
                    }}
                  >
                    {node.value}
                  </span>
                  {isMapped ? (
                    <span
                      style={{
                        fontSize: 10,
                        color: '#4ade80',
                        background: '#052e16',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      mapped
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        color: '#f87171',
                        background: '#2d0a0a',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      unmapped
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ overflowY: 'auto' }}>
            <ExcelPreview
              tree={tree}
              mappings={mappings}
              dragOver={dragOverCell}
              onDrop={handleDrop}
              onDragOver={setDragOverCell}
              onDragLeave={() => setDragOverCell(null)}
            />
          </div>
        </div>
      )}

      {screen === 3 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            height: 'calc(100vh - 53px)',
          }}
        >
          <div
            style={{ background: '#0a1628', padding: 32, overflowY: 'auto' }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#f1f5f9',
                marginBottom: 6,
              }}
            >
              Export Package
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>
              Review summary then export all files
            </div>
            {[
              {
                label: 'Total Fields Extracted',
                value: stats.total,
                color: '#60a5fa',
              },
              { label: 'Auto-Approved', value: stats.high, color: '#4ade80' },
              {
                label: 'Manually Corrected',
                value: audit.filter((e) => e.event === 'CORRECTION').length,
                color: '#fb923c',
              },
              {
                label: 'Template Cells Mapped',
                value:
                  mappings.length +
                  EXCEL_TEMPLATE.filter(
                    (t) =>
                      t.fieldId && flat.find((n) => n.id === t.fieldId)?.value
                  ).length,
                color: '#a78bfa',
              },
              {
                label: 'Audit Trail Events',
                value: audit.length,
                color: '#34d399',
              },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: '#0f1f38',
                  borderRadius: 8,
                  marginBottom: 8,
                  border: '1px solid #1a2744',
                }}
              >
                <span style={{ fontSize: 13, color: '#94a3b8' }}>
                  {c.label}
                </span>
                <span style={{ fontSize: 22, fontWeight: 700, color: c.color }}>
                  {c.value}
                </span>
              </div>
            ))}
            <div
              style={{
                marginTop: 28,
                display: 'flex',
                flexDirection: 'column' as const,
                gap: 10,
              }}
            >
              {[
                {
                  icon: '📊',
                  label: 'Download CAM Report (.xlsx)',
                  color: '#166534',
                  bg: '#052e16',
                },
                {
                  icon: '📋',
                  label: 'Download Audit Trail (.json)',
                  color: '#1e40af',
                  bg: '#0f172a',
                },
                {
                  icon: '📄',
                  label: 'Download Audit PDF (.pdf)',
                  color: '#6d28d9',
                  bg: '#0f0a1e',
                },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={() => setExported(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 18px',
                    borderRadius: 10,
                    border: '1px solid ' + b.color,
                    background: b.bg,
                    cursor: 'pointer',
                    color: 'white',
                    width: '100%',
                    textAlign: 'left' as const,
                  }}
                >
                  <span style={{ fontSize: 22 }}>{b.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {b.label}
                  </span>
                </button>
              ))}
            </div>
            {exported && (
              <div
                style={{
                  marginTop: 20,
                  padding: '12px 16px',
                  background: '#052e16',
                  border: '1px solid #166534',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#4ade80',
                }}
              >
                Export complete — all files ready. Audit trail sealed.
              </div>
            )}
          </div>
          <div style={{ padding: 16, overflowY: 'auto' }}>
            <AuditLog entries={audit} />
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: 4,
            zIndex: 1000,
            minWidth: 180,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '6px 12px',
              fontSize: 11,
              color: '#64748b',
              borderBottom: '1px solid #334155',
              marginBottom: 4,
            }}
          >
            {contextMenu.node.label}
          </div>
          <button
            onClick={() => {
              setEditModal(contextMenu.node);
              setEditValue(contextMenu.node.value || '');
              setContextMenu(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '7px 12px',
              background: 'transparent',
              border: 'none',
              color: '#e2e8f0',
              fontSize: 12,
              textAlign: 'left' as const,
              cursor: 'pointer',
            }}
          >
            Edit Value
          </button>
          <button
            onClick={() => {
              setNewPointModal(contextMenu.node);
              setContextMenu(null);
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '7px 12px',
              background: 'transparent',
              border: 'none',
              color: '#a78bfa',
              fontSize: 12,
              textAlign: 'left' as const,
              cursor: 'pointer',
            }}
          >
            Create New Taxonomy Point
          </button>
        </div>
      )}

      {editModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: 12,
              padding: 28,
              width: 380,
              border: '1px solid #334155',
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                marginBottom: 6,
                color: '#f1f5f9',
              }}
            >
              Edit Value
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              Field: {editModal.label}
            </div>
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                color: '#e2e8f0',
                fontSize: 14,
                boxSizing: 'border-box' as const,
                marginBottom: 16,
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCorrection(editModal, editValue);
              }}
            />
            <div
              style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
            >
              <button
                onClick={() => setEditModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleCorrection(editModal, editValue)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#1d4ed8',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {newPointModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: '#1e293b',
              borderRadius: 12,
              padding: 28,
              width: 420,
              border: '1px solid #6d28d9',
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                marginBottom: 6,
                color: '#f1f5f9',
              }}
            >
              Create New Taxonomy Point
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              This item is outside the 1,500-point taxonomy. Name it to add
              permanently.
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
              Item:{' '}
              <span style={{ color: '#e2e8f0' }}>{newPointModal.label}</span>
            </div>
            <input
              value={newPointName}
              onChange={(e) => setNewPointName(e.target.value)}
              placeholder="e.g. Deferred Tax Asset"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0f172a',
                border: '1px solid #6d28d9',
                borderRadius: 6,
                color: '#e2e8f0',
                fontSize: 14,
                boxSizing: 'border-box' as const,
                marginBottom: 16,
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPointName)
                  handleNewPoint(newPointModal, newPointName);
              }}
            />
            <div
              style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
            >
              <button
                onClick={() => {
                  setNewPointModal(null);
                  setNewPointName('');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #334155',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  newPointName && handleNewPoint(newPointModal, newPointName)
                }
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#6d28d9',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Add to Taxonomy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
