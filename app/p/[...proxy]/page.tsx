import { ProxyStatePreview } from "@/components/proxy/proxy-state-preview"

type ProxyPageProps = {
  params: Promise<{ proxy: string[] }>
}

export default async function ProxyPage({ params }: ProxyPageProps) {
  const { proxy } = await params
  const routeReference = `/p/${proxy.map(encodeURIComponent).join("/")}`

  return <ProxyStatePreview routeReference={routeReference} />
}
