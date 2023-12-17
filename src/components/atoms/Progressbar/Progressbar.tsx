

export interface ProgressbarProps {
  label: string,
  maxValue: number,
  currentValue: number,
}


export const Progressbar = ({ label, maxValue, currentValue } : ProgressbarProps) => {
  const progress = (currentValue / maxValue) * 100;
  return (
    <div className="w-full">
      <p className="text-center mb-2">{label}</p>
      <div className="w-full h-10 rounded-md bg-gray-700 relative">
        <div className="text-slate-50 flex justify-center items-center h-full absolute left-0 right-0 w-full z-10">
          {currentValue} / {maxValue}
        </div>
        <div
          className="bg-blue-700 text-2xl h-10 font-medium text-blue-100 text-center p-1 leading-none rounded-md absolute"
          style={{width: `${progress}%`}}>
        </div>
      </div>
    </div>
  )
}