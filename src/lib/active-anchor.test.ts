import { describe, it, expect } from 'vitest'
import { pickActiveAnchor, type MeasuredAnchor } from './active-anchor'

const anchor = (tile: MeasuredAnchor['tile'], locId: string, top: number): MeasuredAnchor => ({
  tile,
  locId,
  top,
})

describe('pickActiveAnchor', () => {
  it('アンカーが無ければ null', () => {
    expect(pickActiveAnchor([], 300)).toBeNull()
  })

  it('全タイルが基準線より下 (ページ最上部) なら null', () => {
    const anchors = [anchor('weather', 'a', 400), anchor('rain', 'a', 900)]
    expect(pickActiveAnchor(anchors, 300)).toBeNull()
  })

  it('基準線を超えた最後のタイルを現在地として返す', () => {
    const anchors = [
      anchor('weather', 'a', -500),
      anchor('rain', 'a', 100),
      anchor('headache', 'a', 700),
    ]
    expect(pickActiveAnchor(anchors, 300)).toEqual({ tile: 'rain', locId: 'a' })
  })

  it('基準線ちょうどのタイルは現在地に含める', () => {
    const anchors = [anchor('weather', 'a', 300)]
    expect(pickActiveAnchor(anchors, 300)).toEqual({ tile: 'weather', locId: 'a' })
  })

  it('最後まで基準線に達していれば末尾タイルを返す (ページ最下部)', () => {
    const anchors = [
      anchor('weather', 'a', -900),
      anchor('diary', 'a', -100),
    ]
    expect(pickActiveAnchor(anchors, 300)).toEqual({ tile: 'diary', locId: 'a' })
  })

  it('複数地点でも文書順で最後に基準線を超えた地点のタイルを返す', () => {
    const anchors = [
      anchor('weather', 'a', -800),
      anchor('diary', 'a', -200),
      anchor('weather', 'b', 150),
      anchor('rain', 'b', 600),
    ]
    expect(pickActiveAnchor(anchors, 300)).toEqual({ tile: 'weather', locId: 'b' })
  })

  it('文書順前提: 基準線より下のタイル以降は走査しない (早期 break)', () => {
    // 文書順で渡す契約なので、後方に紛れた小さい top は無視される
    const anchors = [
      anchor('weather', 'a', 400),
      anchor('rain', 'a', 100),
    ]
    expect(pickActiveAnchor(anchors, 300)).toBeNull()
  })
})
