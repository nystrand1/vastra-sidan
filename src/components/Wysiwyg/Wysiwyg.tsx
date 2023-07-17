
interface WysiwygProps {
  content: string
}

export const Wysiwyg = ({ content } : WysiwygProps) => {
  return (
    <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
  )
}