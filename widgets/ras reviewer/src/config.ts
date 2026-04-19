import { type ImmutableObject } from 'seamless-immutable'

export interface Config {
  polygonLayerUrl: string
  reviewTableUrl: string
  polygonIdField: string
  reviewTableIdField: string
  officeField: string
  decisionField: string
  commentsField: string
  polygonUrlParam: string
  officeUrlParam: string
}

export type IMConfig = ImmutableObject<Config>
