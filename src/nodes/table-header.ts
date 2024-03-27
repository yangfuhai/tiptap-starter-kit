import { TableHeader as TTableHeader, TableHeaderOptions as TTableHeaderOptions } from "@tiptap/extension-table-header";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { posToDOMRect } from "@tiptap/core";
import { FloatMenuView } from "../extensions/float-menu/view";
import { NodeMarkdownStorage } from "../extensions/markdown";
import { icon } from "../utils/icons";
import { getCellsInRow, isCellSelection, isColumnSelected, isTableSelected, selectColumn } from "../utils/editor";
import { ClickMenuItemStorage } from "../extensions/click-menu/view";

export interface TableHeaderOptions extends TTableHeaderOptions {
  dictionary: {
    insertLeft: string;
    insertRight: string;
    deleteCol: string;
  };
}

export const TableHeader = TTableHeader.extend<TableHeaderOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      dictionary: {
        insertLeft: "Insert column on the left",
        insertRight: "Insert column on the right",
        deleteCol: "Delete column",
      },
    };
  },
  addStorage() {
    return {
      ...this.parent?.(),
      clickMenu: false,
      parser: {
        match: node => node.type === "tableCell" && !!node.isHeader,
        apply: (state, node, type) => {
          const align = node.align as string;
          state.openNode(type, { alignment: align });
          state.openNode(state.editor.schema.nodes.paragraph);
          state.next(node.children);
          state.closeNode();
          state.closeNode();
        },
      },
      serializer: {
        match: node => node.type.name === this.name,
        apply: (state, node) => {
          state.openNode({ type: "tableCell" });
          state.next(node.content);
          state.closeNode();
        },
      },
    } satisfies NodeMarkdownStorage & ClickMenuItemStorage;
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey(`${this.name}-float-menu`),
        view: () => new FloatMenuView({
          editor: this.editor,
          show: ({ editor }) => {
            if (!editor.isEditable) {
              return false;
            }
            const selection = editor.state.selection;
            if (isTableSelected(selection)) {
              return false;
            }
            const cells = getCellsInRow(selection, 0);
            return !!cells?.some((_cell, index) => isColumnSelected(selection, index));
          },
          rect: ({ editor }) => {
            const { view, state } = editor;
            if (isCellSelection(state.selection)) {
              const cell = view.nodeDOM(state.selection.$headCell.pos) as HTMLElement;
              if (cell) {
                const grip = cell.querySelector(".ProseMirror-table-grip-col");
                if (grip) {
                  return grip.getBoundingClientRect();
                } else {
                  return cell.getBoundingClientRect();
                }
              }
            }
            return posToDOMRect(view, state.selection.from, state.selection.to);
          },
          onInit: ({ view, editor, element }) => {
            const left = view.createButton({
              name: this.options.dictionary.insertLeft,
              view: icon("left"),
              onClick: () => editor.chain().addColumnBefore().run(),
            });
            const right = view.createButton({
              name: this.options.dictionary.insertRight,
              view: icon("right"),
              onClick: () => editor.chain().addColumnAfter().run(),
            });
            const remove = view.createButton({
              name: this.options.dictionary.deleteCol,
              view: icon("remove"),
              onClick: () => editor.chain().deleteColumn().run(),
            });

            element.append(left.button);
            element.append(right.button);
            element.append(remove.button);
          },
        }),
        props: {
          decorations: (state) => {
            const { tr, doc, selection } = state;
            const decorations: Array<Decoration> = [];
            const cells = getCellsInRow(selection, 0);
            if (cells) {
              for (let index = 0; index < cells.length; index++) {
                decorations.push(
                  Decoration.widget(cells[index].pos + 1, () => {
                    const grip = document.createElement("div");
                    grip.classList.add("ProseMirror-table-grip-col");
                    if (isColumnSelected(selection, index)) {
                      grip.classList.add("active");
                    }
                    if (index === 0) {
                      grip.classList.add("first");
                    } else if (index === cells.length - 1) {
                      grip.classList.add("last");
                    }
                    const drag = document.createElement("div");
                    drag.classList.add("ProseMirror-table-grip-drag");
                    drag.innerHTML = icon("drag");
                    drag.addEventListener("mousedown", (event) => {
                      event.preventDefault();
                      event.stopImmediatePropagation();
                      this.editor.view.dispatch(selectColumn(tr, index));
                    });
                    grip.append(drag);
                    return grip;
                  }),
                );
              }
            }
            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
