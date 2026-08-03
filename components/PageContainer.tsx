import type { ReactNode } from 'react'

type PageContainerProps = {
  children: ReactNode
}

/** Shared outer container for every public page. */
export default function PageContainer({ children }: PageContainerProps): React.ReactElement {
  return <div className="mx-auto w-full max-w-[1440px]">{children}</div>
}
