import { type ImmutableObject } from 'seamless-immutable'

export interface Config {
  polygonLayerTitle: string
  reviewTableTitle: string
  polygonLayerUrl: string
  reviewTableUrl: string
  polygonIdField: string
  reviewTableIdField: string
  officeField: string
  decisionField: string
  commentsField: string
}

export type IMConfig = ImmutableObject<Config>
