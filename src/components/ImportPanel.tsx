import { useRef } from 'react';
import { Button } from '@heroui/react';
import type { ImportedFileRef } from '../types';

interface ImportPanelProps {
  disabled: boolean;
  onImport: (files: ImportedFileRef[]) => void;
}

function toImportedFile(file: File): ImportedFileRef {
  return {
    name: file.name,
    path: file.webkitRelativePath || file.name,
    file,
  };
}

export function ImportPanel({ disabled, onImport }: ImportPanelProps) {
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    onImport(Array.from(event.currentTarget.files ?? []).map(toImportedFile));
    event.currentTarget.value = '';
  }

  return (
    <div className="flex items-center gap-2 max-sm:flex-col max-sm:w-full">
      <Button
        variant="primary"
        size="sm"
        isDisabled={disabled}
        onPress={() => folderRef.current?.click()}
      >
        选择 DATAFILE 文件夹
      </Button>
      <input
        ref={folderRef}
        type="file"
        multiple
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
        {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
      />
      <Button
        variant="outline"
        size="sm"
        isDisabled={disabled}
        onPress={() => filesRef.current?.click()}
      >
        选择 EDF 文件
      </Button>
      <input
        ref={filesRef}
        aria-label="选择 EDF 文件"
        type="file"
        multiple
        accept=".edf,.bin"
        disabled={disabled}
        onChange={handleChange}
        className="sr-only"
      />
    </div>
  );
}
