import { Folder } from '../types/question';

export interface FlattenedFolderItem {
  folder: Folder;
  depth: number;
  hasChildren: boolean;
}

export interface FolderTreeNode extends Folder {
  depth: number;
  children: FolderTreeNode[];
}

const getFolderId = (folder: Folder) => folder.id;

const getParentId = (folder: Folder) => folder.parentId ?? null;

const buildChildrenMap = (folders: Folder[]) => {
  const childrenMap = new Map<string, Folder[]>();

  folders.forEach(folder => {
    const parentId = getParentId(folder);
    if (!parentId) return;

    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(folder);
  });

  return childrenMap;
};

const getRootFolders = (folders: Folder[]) => {
  const folderIds = new Set(folders.map(getFolderId));

  return folders.filter(folder => {
    const parentId = getParentId(folder);
    return !parentId || !folderIds.has(parentId) || parentId === folder.id;
  });
};

const createTreeNode = (
  folder: Folder,
  depth: number,
  childrenMap: Map<string, Folder[]>,
  visiting: Set<string>,
  emitted: Set<string>
): FolderTreeNode => {
  const folderId = getFolderId(folder);

  if (visiting.has(folderId)) {
    return {
      ...folder,
      depth,
      children: [],
    };
  }

  visiting.add(folderId);

  const children = (childrenMap.get(folderId) || [])
    .filter(child => !emitted.has(child.id))
    .map(child => createTreeNode(child, depth + 1, childrenMap, visiting, emitted));

  visiting.delete(folderId);
  emitted.add(folderId);

  return {
    ...folder,
    depth,
    children,
  };
};

/**
 * Folder[] を深さ付きのツリー構造へ変換する。
 * 循環参照があっても、同じIDを再訪しないことで無限再帰を避ける。
 */
export const buildFolderTree = (folders: Folder[]): FolderTreeNode[] => {
  const childrenMap = buildChildrenMap(folders);
  const roots = getRootFolders(folders);
  const tree: FolderTreeNode[] = [];
  const emitted = new Set<string>();

  roots.forEach(root => {
    if (emitted.has(root.id)) return;
    tree.push(createTreeNode(root, 0, childrenMap, new Set<string>(), emitted));
  });

  folders.forEach(folder => {
    if (emitted.has(folder.id)) return;
    tree.push(createTreeNode(folder, 0, childrenMap, new Set<string>(), emitted));
  });

  return tree;
};

const flattenTreeNodes = (
  nodes: FolderTreeNode[],
  result: FlattenedFolderItem[]
) => {
  nodes.forEach(node => {
    result.push({
      folder: {
        ...node,
        children: undefined,
      } as unknown as Folder,
      depth: node.depth,
      hasChildren: node.children.length > 0,
    });

    if (node.children.length > 0) {
      flattenTreeNodes(node.children, result);
    }
  });
};

/**
 * Folder[] を「親の直後に子が並ぶ」深さ付きフラット配列へ変換する。
 * 管理画面や選択UIのインデント表示に向いている。
 */
export const getFlattenedFolderTree = (folders: Folder[]): FlattenedFolderItem[] => {
  const tree = buildFolderTree(folders);
  const flattened: FlattenedFolderItem[] = [];
  flattenTreeNodes(tree, flattened);
  return flattened;
};
