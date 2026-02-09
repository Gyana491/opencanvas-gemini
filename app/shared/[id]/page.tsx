import { Metadata } from "next"
import prisma from "@/lib/prisma"
import SharedWorkflowClient from "./client"

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      select: { name: true, thumbnail: true, isShared: true },
    })

    if (!workflow || !workflow.isShared) {
      return {
        title: "Shared Workflow - OpenCanvas",
        description: "View and duplicate this shared workflow",
      }
    }

    const title = `${workflow.name} - OpenCanvas`
    const description = `View and duplicate this shared workflow: ${workflow.name}`

    // Use thumbnail if available, otherwise use logo as fallback
    const ogImage = workflow.thumbnail || "/logo.png"

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: workflow.name,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage],
      },
    }
  } catch {
    return {
      title: "Shared Workflow - OpenCanvas",
      description: "View and duplicate this shared workflow",
    }
  }
}

export default async function SharedWorkflowPage({ params }: Props) {
  const { id } = await params
  return <SharedWorkflowClient workflowId={id} />
}
