export interface Attachment {
  id: string;
  file: File;
  type: 'image' | 'file';
  previewUrl?: string;
  name: string;
  size: number;
  uploadProgress?: number;
  status: 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
}

export interface Model {
  id: string;
  name: string;
  capabilities?: string[];
}

export interface Provider {
  id: string;
  name: string;
  icon?: string;
  models: Model[];
}

export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  shortcut: string;
}

export interface MentionItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface ChatInputProps {
  providers?: Provider[];
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  onSend?: (message: { text: string; markdown: string; attachments: Attachment[]; mentions: string[] }) => void | Promise<void>;
  onStop?: () => void;
  onSlashCommand?: (command: SlashCommand) => void;
  onMention?: (mention: MentionItem) => void;
  slashCommands?: SlashCommand[];
  mentions?: MentionItem[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  className?: string;
}
