
interface WysiwygProps {
  content: string
}

export const Wysiwyg = ({ content } : WysiwygProps) => {
  return (
    <div className="[&_p]:mb-4 [&_h3]:mb-4 [&_div]:mb-4 [&_a]:underline" dangerouslySetInnerHTML={{ __html: content }} />
  )
}