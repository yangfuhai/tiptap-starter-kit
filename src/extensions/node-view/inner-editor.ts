import { Editor, NodeViewRendererProps } from "@tiptap/core";
import { Node } from "@tiptap/pm/model";
import { keymap } from "@tiptap/pm/keymap";
import { StepMap } from "@tiptap/pm/transform";
import { newlineInCode } from "@tiptap/pm/commands";
import { EditorView, NodeView } from "@tiptap/pm/view";
import { EditorState, TextSelection } from "@tiptap/pm/state";

export interface InnerEditorViewOptions extends NodeViewRendererProps {
  id?: string;
  tag?: keyof HTMLElementTagNameMap;
  class?: string | string[];
  style?: CSSStyleDeclaration | CSSStyleDeclaration[];
  onRender?: (props: { view: InnerEditorView; editor: Editor; $root: HTMLElement; $editor: HTMLElement; $preview: HTMLElement }) => void;
  onOpen?: (props: { view: InnerEditorView; editor: Editor; $root: HTMLElement; $editor: HTMLElement; $preview: HTMLElement }) => void;
  onClose?: (props: { view: InnerEditorView; editor: Editor; $root: HTMLElement; $editor: HTMLElement; $preview: HTMLElement }) => void;
  onInit?: (props: { view: InnerEditorView; editor: Editor; $root: HTMLElement; $editor: HTMLElement; $preview: HTMLElement }) => void;
  onUpdate?: (props: { view: InnerEditorView; editor: Editor; $root: HTMLElement; $editor: HTMLElement; $preview: HTMLElement }) => void;
  onDestroy?: (props: { view: InnerEditorView; editor: Editor; $root: HTMLElement; $editor: HTMLElement; $preview: HTMLElement }) => void;
}

export class InnerEditorView implements NodeView {
  private readonly editor: Editor;
  private readonly options: InnerEditorViewOptions;

  private _node: Node;
  private _view: EditorView | undefined;
  private _root: HTMLElement;
  private _editor: HTMLElement;
  private _preview: HTMLElement;

  public static create(options: Omit<InnerEditorViewOptions, keyof NodeViewRendererProps>) {
    return (_options: NodeViewRendererProps) => new InnerEditorView({ ..._options, ...options });
  }

  constructor(options: InnerEditorViewOptions) {
    this.editor = options.editor;
    this.options = options;
    this._node = options.node;
    this._root = document.createElement(options.tag ?? "div");
    this._root.classList.add("ProseMirror-ie");
    if (this.options.id) {
      this._root.setAttribute("name", this.options.id);
    }
    if (this.options.class) {
      for (const item of Array.isArray(this.options.class) ? this.options.class : [this.options.class]) {
        this._root.classList.add(item);
      }
    }
    if (this.options.style) {
      for (const item of Array.isArray(this.options.style) ? this.options.style : [this.options.style]) {
        for (const [key, val] of Object.entries(item)) {
          // @ts-expect-error
          this._root.style[key] = val;
        }
      }
    }
    for (const [key, value] of Object.entries(this.options.HTMLAttributes)) {
      this._root.setAttribute(key, value);
    }
    this._editor = document.createElement("div");
    this._preview = document.createElement("div");
    if (this.options.onInit) {
      this.options.onInit({
        view: this,
        editor: this.editor,
        $root: this._root,
        $editor: this._editor,
        $preview: this._preview,
      });
    }
    this._root.append(this._editor);
    this._root.append(this._preview);
  }

  public get dom() {
    return this._root;
  }

  public get view() {
    return this._view;
  }

  public get node() {
    return this._node;
  }

  public get getPos() {
    return this.options.getPos;
  }

  public get $root() {
    return this._root;
  }

  public get $editor() {
    return this._editor;
  }

  public get $preview() {
    return this._preview;
  }

  public update(node: Node) {
    if (node.type !== this.options.node.type) {
      return false;
    }
    this._node = node;
    if (this.options.onUpdate) {
      this.options.onUpdate({
        view: this,
        editor: this.editor,
        $root: this._root,
        $editor: this._editor,
        $preview: this._preview,
      });
    }
    if (this.options.onRender) {
      this.options.onRender({
        view: this,
        editor: this.editor,
        $root: this._root,
        $editor: this._editor,
        $preview: this._preview,
      });
    }
    if (this._view) {
      const state = this._view.state;
      const start = node.content.findDiffStart(state.doc.content);
      if (typeof start === "number") {
        const diff = node.content.findDiffEnd(state.doc.content);
        if (diff) {
          let endA = diff.a;
          let endB = diff.b;
          const overlap = start - Math.min(endA, endB);
          if (overlap > 0) {
            endA += overlap;
            endB += overlap;
          }
          this._view.dispatch(
            state.tr
              .replace(start, endB, node.slice(start, endA))
              .setMeta("fromOutside", true),
          );
        }
      }
    }
    return true;
  }

  public selectNode() {
    if (!this.editor.isEditable) {
      return;
    }
    if (this.options.onOpen) {
      this.options.onOpen({
        view: this,
        editor: this.editor,
        $root: this._root,
        $editor: this._editor,
        $preview: this._preview,
      });
    }
    if (this.options.onRender) {
      this.options.onRender({
        view: this,
        editor: this.editor,
        $root: this._root,
        $editor: this._editor,
        $preview: this._preview,
      });
    }
    this._editor.style.display = "block";
    this._view = new EditorView(this._editor, {
      state: EditorState.create({
        doc: this._node,
        plugins: [keymap({
          "Tab": (state, dispatch) => {
            if (dispatch) {
              dispatch(state.tr.insertText("  "));
            }
            return true;
          },
          "Enter": newlineInCode,
          "Mod-Enter": () => {
            const $view = this.editor.view;
            const $state = $view.state;
            const $to = $state.selection.to;
            const $tr = $state.tr.replaceWith(
              $to,
              $to,
              $state.schema.nodes.paragraph.createAndFill()!,
            );
            $view.dispatch($tr.setSelection(TextSelection.create($tr.doc, $to)));
            $view.focus();
            return true;
          },
        })],
      }),
      dispatchTransaction: (tr) => {
        if (!this._view) {
          return;
        }
        const { state, transactions } = this._view.state.applyTransaction(tr);
        this._view.updateState(state);

        if (!tr.getMeta("fromOutside")) {
          const $view = this.editor.view;
          const $state = $view.state;
          const $tr = $state.tr;
          // @ts-expect-error
          const $offset = StepMap.offset(this.options.getPos() + 1);
          transactions.forEach((transaction) => {
            transaction.steps.forEach((step) => {
              const mapped = step.map($offset);
              if (!mapped) {
                throw new Error("step discarded!");
              }
              $tr.step(mapped);
            });
          });
          if ($tr.docChanged) {
            $view.dispatch($tr);
          }
        }
      },
    });
    this._view.focus();
  }

  public deselectNode() {
    if (this.options.onClose) {
      this.options.onClose({
        view: this,
        editor: this.editor,
        $root: this._root,
        $editor: this._editor,
        $preview: this._preview,
      });
    }
    if (this._view) {
      this._view.destroy();
    }
    this._view = undefined;
    this._editor.style.display = "none";
  }

  public stopEvent(event: Event) {
    if (this._view && event.target) {
      return this._view.dom.contains(event.target as Element);
    }
    return false;
  }

  public ignoreMutation() {
    return true;
  }

  public destroy() {
    this.deselectNode();
    if (this.options.onDestroy) {
      this.options.onDestroy({
        view: this,
        editor: this.editor,
        $root: this._root,
        $editor: this._editor,
        $preview: this._preview,
      });
    }
    this.$root.remove();
  }
}
