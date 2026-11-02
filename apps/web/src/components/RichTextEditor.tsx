import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Button, Space } from 'antd';
import { useEffect } from 'react';

type Json = Record<string, unknown> | null | undefined;

interface Props {
  value?: Json;
  onChange?: (json: Record<string, unknown>) => void;
  onBlur?: (json: Record<string, unknown>) => void;
  editable?: boolean;
  placeholder?: string;
  toolbar?: boolean;
}

/** Mô tả và comment dùng TipTap, lưu dạng JSON (mục 3). editable=false thì chỉ hiển thị. */
export function RichTextEditor({ value, onChange, onBlur, editable = true, placeholder = 'Nhập nội dung…', toolbar = true }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: !editable }), Placeholder.configure({ placeholder })],
    content: (value as any) ?? '',
    editable,
    onUpdate: ({ editor }) => onChange?.(editor.getJSON() as Record<string, unknown>),
    onBlur: ({ editor }) => onBlur?.(editor.getJSON() as Record<string, unknown>),
  });
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);
  useEffect(() => {
    if (editor && !editor.isFocused && value && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) editor.commands.setContent(value as any, false);
  }, [editor, value]);
  if (!editor) return null;
  return (
    <div>
      {editable && toolbar && (
        <Space size={4} style={{ marginBottom: 4 }}>
          <Button size="small" type={editor.isActive('bold') ? 'primary' : 'default'} onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
          <Button size="small" type={editor.isActive('italic') ? 'primary' : 'default'} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Button>
          <Button size="small" type={editor.isActive('bulletList') ? 'primary' : 'default'} onClick={() => editor.chain().focus().toggleBulletList().run()}>• Danh sách</Button>
          <Button size="small" type={editor.isActive('codeBlock') ? 'primary' : 'default'} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{'</>'}</Button>
        </Space>
      )}
      <EditorContent editor={editor} style={editable ? undefined : { padding: 0 }} />
    </div>
  );
}

export const isEmptyDoc = (doc: Json) => !doc || !JSON.stringify(doc).includes('"text"');
