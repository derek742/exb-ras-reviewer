import { type ImmutableObject } from 'seamless-immutable'

export interface Config {
  polygonLayerTitle: string
  reviewTableTitle: string
  polygonLayerUrl: string
  reviewTableUrl: string
  polygonIdField: string
  polygonJoinField: string
  tableJoinField: string
  officeField: string
  approvalField: string
  commentsField: string
}

export type IMConfig = ImmutableObject<Config>
