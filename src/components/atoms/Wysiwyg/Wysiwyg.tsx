
interface WysiwygProps {
  content: string
}

export const Wysiwyg = ({ content } : WysiwygProps) => {
  return (
    <div className="[&_p]:mb-4 [&_h3]:mb-4" dangerouslySetInnerHTML={{ __html: content }} />
  )
}